import ConvexCore
import DesktopShared
import Foundation
import SwiftCrossUI

internal final class WikiListViewModel: SwiftCrossUI.ObservableObject, Performing {
    @SwiftCrossUI.Published var wikis = [Wiki]()
    @SwiftCrossUI.Published var isLoading = true
    @SwiftCrossUI.Published var errorMessage: String?
    @SwiftCrossUI.Published var selectedIDs = Set<String>()

    var activeWikis: [Wiki] {
        var result = [Wiki]()
        for w in wikis where w.deletedAt == nil {
            result.append(w)
        }
        return result
    }

    var deletedWikis: [Wiki] {
        var result = [Wiki]()
        for w in wikis where w.deletedAt != nil {
            result.append(w)
        }
        return result
    }

    @MainActor
    func load(orgID: String) async {
        await performLoading({ isLoading = $0 }) {
            let result = try await WikiAPI.list(
                client,
                orgId: orgID
            )
            wikis = result.page
        }
    }

    @MainActor
    func createWiki(orgID: String, title: String, slug: String) async {
        await perform {
            try await WikiAPI.create(
                client,
                orgId: orgID,
                content: "",
                slug: slug,
                status: .draft,
                title: title
            )
            await self.load(orgID: orgID)
        }
    }

    @MainActor
    func deleteWiki(orgID: String, id: String) async {
        await perform {
            try await WikiAPI.rm(client, orgId: orgID, id: id)
            await self.load(orgID: orgID)
        }
    }

    @MainActor
    func restoreWiki(orgID: String, id: String) async {
        await perform {
            try await WikiAPI.restore(client, orgId: orgID, id: id)
            await self.load(orgID: orgID)
        }
    }

    @MainActor
    func toggleSelect(id: String) {
        if selectedIDs.contains(id) {
            selectedIDs.remove(id)
        } else {
            selectedIDs.insert(id)
        }
    }

    @MainActor
    func toggleSelectAll() {
        let active = activeWikis
        if selectedIDs.count == active.count {
            selectedIDs.removeAll()
        } else {
            var ids = Set<String>()
            for w in active {
                ids.insert(w._id)
            }
            selectedIDs = ids
        }
    }

    @MainActor
    func clearSelection() {
        selectedIDs.removeAll()
    }

    @MainActor
    func bulkDeleteWikis(orgID: String) async {
        await perform {
            try await WikiAPI.rm(client, orgId: orgID, ids: Array(selectedIDs))
            selectedIDs.removeAll()
            await self.load(orgID: orgID)
        }
    }
}

internal struct WikiListView: View {
    let orgID: String
    let role: OrgRole
    var path: Binding<NavigationPath>
    @State private var viewModel = WikiListViewModel()
    @State private var showCreateForm = false
    @State private var newTitle = ""
    @State private var newSlug = ""

    var body: some View {
        VStack {
            HStack {
                Text("Wiki")
                Button("New Page") { showCreateForm = true }
                if role.isAdmin {
                    Button(viewModel.selectedIDs.count == viewModel.activeWikis.count ? "Deselect All" : "Select All") {
                        viewModel.toggleSelectAll()
                    }
                    if !viewModel.selectedIDs.isEmpty {
                        Button("Delete Selected (\(viewModel.selectedIDs.count))") {
                            Task { await viewModel.bulkDeleteWikis(orgID: orgID) }
                        }
                    }
                }
            }
            .padding(.bottom, 4)

            if showCreateForm {
                VStack {
                    TextField("Page Title", text: $newTitle)
                    TextField("Slug (URL-friendly)", text: $newSlug)
                    HStack {
                        Button("Cancel") { showCreateForm = false }
                        Button("Create") {
                            Task {
                                await viewModel.createWiki(orgID: orgID, title: newTitle, slug: newSlug)
                                newTitle = ""
                                newSlug = ""
                                showCreateForm = false
                            }
                        }
                    }
                }
                .padding(.bottom, 8)
            }

            if viewModel.isLoading {
                Text("Loading...")
            } else if let msg = viewModel.errorMessage {
                Text(msg)
                    .foregroundColor(.red)
            } else if viewModel.wikis.isEmpty {
                Text("No wiki pages yet")
            } else {
                ScrollView {
                    ForEach(viewModel.activeWikis) { wiki in
                        HStack {
                            if role.isAdmin {
                                Button(viewModel.selectedIDs.contains(wiki._id) ? "[x]" : "[ ]") {
                                    viewModel.toggleSelect(id: wiki._id)
                                }
                            }
                            VStack {
                                Text(wiki.title)
                                HStack {
                                    Text(wiki.slug)
                                    Text(wiki.status.displayName)
                                }
                            }
                            Button("Delete") {
                                Task { await viewModel.deleteWiki(orgID: orgID, id: wiki._id) }
                            }
                            NavigationLink("Edit", value: wiki._id, path: path)
                        }
                        .padding(.bottom, 4)
                    }
                    ForEach(viewModel.deletedWikis) { wiki in
                        HStack {
                            Text(wiki.title)
                            Text("(Deleted)")
                            Button("Restore") {
                                Task { await viewModel.restoreWiki(orgID: orgID, id: wiki._id) }
                            }
                        }
                        .padding(.bottom, 4)
                    }
                }
            }
        }
        .task {
            await viewModel.load(orgID: orgID)
        }
    }
}

internal final class WikiEditViewModel: SwiftCrossUI.ObservableObject, Performing {
    @SwiftCrossUI.Published var title = ""
    @SwiftCrossUI.Published var slug = ""
    @SwiftCrossUI.Published var content = ""
    @SwiftCrossUI.Published var status = WikiStatus.draft
    @SwiftCrossUI.Published var isLoading = true
    @SwiftCrossUI.Published var saveStatus = ""
    @SwiftCrossUI.Published var errorMessage: String?
    @SwiftCrossUI.Published var editors = [EditorEntry]()
    @SwiftCrossUI.Published var members = [OrgMemberEntry]()
    var autoSaveTask: Task<Void, Never>?

    var availableMembers: [OrgMemberEntry] {
        var editorIDs = Set<String>()
        for e in editors {
            editorIDs.insert(e.userId)
        }
        var result = [OrgMemberEntry]()
        for m in members where !editorIDs.contains(m.userId) {
            result.append(m)
        }
        return result
    }

    @MainActor
    func load(orgID: String, wikiID: String) async {
        await performLoading({ isLoading = $0 }) {
            let wiki = try await WikiAPI.read(client, orgId: orgID, id: wikiID)
            title = wiki.title
            slug = wiki.slug
            content = wiki.content ?? ""
            status = wiki.status
            editors = try await WikiAPI.editors(client, orgId: orgID, wikiId: wikiID)
            members = try await OrgAPI.members(client, orgId: orgID)
        }
    }

    @MainActor
    func scheduleSave(orgID: String, wikiID: String) {
        autoSaveTask?.cancel()
        saveStatus = "Editing..."
        autoSaveTask = Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if !Task.isCancelled {
                await save(orgID: orgID, wikiID: wikiID)
            }
        }
    }

    @MainActor
    func save(orgID: String, wikiID: String) async {
        saveStatus = "Saving..."
        await perform {
            try await WikiAPI.update(
                client,
                orgId: orgID,
                id: wikiID,
                content: content,
                slug: slug,
                status: status,
                title: title
            )
            saveStatus = "Saved"
        }
        if errorMessage != nil {
            saveStatus = "Error saving"
        }
    }

    @MainActor
    func deleteWiki(orgID: String, wikiID: String) async {
        await perform {
            try await WikiAPI.rm(client, orgId: orgID, id: wikiID)
        }
    }

    @MainActor
    func addEditor(orgID: String, editorId: String, wikiID: String) async {
        await perform {
            try await WikiAPI.addEditor(client, orgId: orgID, editorId: editorId, wikiId: wikiID)
            editors = try await WikiAPI.editors(client, orgId: orgID, wikiId: wikiID)
        }
    }

    @MainActor
    func removeEditor(orgID: String, editorId: String, wikiID: String) async {
        await perform {
            try await WikiAPI.removeEditor(client, orgId: orgID, editorId: editorId, wikiId: wikiID)
            editors = try await WikiAPI.editors(client, orgId: orgID, wikiId: wikiID)
        }
    }

    func cancelAutoSave() {
        autoSaveTask?.cancel()
    }
}

internal struct WikiEditView: View {
    let orgID: String
    let wikiID: String
    let role: OrgRole
    @State private var viewModel = WikiEditViewModel()

    var body: some View {
        VStack {
            if viewModel.isLoading {
                Text("Loading...")
            } else {
                if role.isAdmin {
                    Text("Editors")
                        .padding(.bottom, 4)
                    if viewModel.editors.isEmpty {
                        Text("No editors")
                    } else {
                        ForEach(viewModel.editors) { editor in
                            HStack {
                                Text(editor.name ?? editor.email ?? editor.userId)
                                Button("Remove") {
                                    Task { await viewModel.removeEditor(orgID: orgID, editorId: editor.userId, wikiID: wikiID) }
                                }
                            }
                        }
                    }
                    Text("Add Editor")
                        .padding(.top, 4)
                    ForEach(viewModel.availableMembers) { member in
                        HStack {
                            Text(member.name ?? member.email ?? member.userId)
                            Button("Add") {
                                Task { await viewModel.addEditor(orgID: orgID, editorId: member.userId, wikiID: wikiID) }
                            }
                        }
                    }
                }

                TextField("Title", text: $viewModel.title)
                    .onChange(of: viewModel.title) { viewModel.scheduleSave(orgID: orgID, wikiID: wikiID) }
                TextField("Slug", text: $viewModel.slug)
                    .onChange(of: viewModel.slug) { viewModel.scheduleSave(orgID: orgID, wikiID: wikiID) }
                HStack {
                    ForEach(0..<WikiStatus.allCases.count, id: \.self) { idx in
                        let s = WikiStatus.allCases[idx]
                        Button(s.displayName) {
                            viewModel.status = s
                            viewModel.scheduleSave(orgID: orgID, wikiID: wikiID)
                        }
                    }
                }
                TextField("Content", text: $viewModel.content)
                    .onChange(of: viewModel.content) { viewModel.scheduleSave(orgID: orgID, wikiID: wikiID) }

                if let msg = viewModel.errorMessage {
                    Text(msg)
                        .foregroundColor(.red)
                }

                HStack {
                    Button("Save") {
                        viewModel.cancelAutoSave()
                        Task { await viewModel.save(orgID: orgID, wikiID: wikiID) }
                    }
                    if role.isAdmin {
                        Button("Delete") {
                            viewModel.cancelAutoSave()
                            Task { await viewModel.deleteWiki(orgID: orgID, wikiID: wikiID) }
                        }
                    }
                }
                .padding(.top, 4)

                if !viewModel.saveStatus.isEmpty {
                    Text(viewModel.saveStatus)
                }
            }
        }
        .task {
            await viewModel.load(orgID: orgID, wikiID: wikiID)
        }
        .onDisappear {
            viewModel.cancelAutoSave()
        }
    }
}
