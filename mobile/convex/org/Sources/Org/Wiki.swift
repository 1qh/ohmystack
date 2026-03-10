import ConvexShared
import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
internal final class WikiListViewModel: Performing {
    let sub = Sub<PaginatedResult<Wiki>>()
    var mutationError: String?
    var selectedIDs = Set<String>()

    var wikis: [Wiki] {
        sub.data?.page ?? []
    }

    var isLoading: Bool {
        sub.isLoading
    }

    var errorMessage: String? {
        sub.error ?? mutationError
    }

    func start(orgID: String) {
        sub.bind { WikiAPI.subscribeList(orgId: orgID, where: nil, onUpdate: $0, onError: $1) }
    }

    func stop() {
        sub.cancel()
    }

    func createWiki(orgID: String, title: String, slug: String) {
        perform { try await WikiAPI.create(orgId: orgID, content: "", slug: slug, status: .draft, title: title) }
    }

    func deleteWiki(orgID: String, id: String) {
        perform { try await WikiAPI.rm(orgId: orgID, id: id) }
    }

    func restoreWiki(orgID: String, id: String) {
        perform { try await WikiAPI.restore(orgId: orgID, id: id) }
    }

    func toggleSelect(id: String) {
        if selectedIDs.contains(id) {
            selectedIDs.remove(id)
        } else {
            selectedIDs.insert(id)
        }
    }

    func clearSelection() {
        selectedIDs = Set<String>()
    }

    func bulkDeleteWikis(orgID: String) {
        perform {
            try await WikiAPI.rm(orgId: orgID, ids: Array(self.selectedIDs))
            self.selectedIDs = Set<String>()
        }
    }
}

internal struct WikiListView: View {
    let orgID: String

    let role: OrgRole

    @State private var viewModel = WikiListViewModel()

    @State private var showCreateSheet = false

    @State private var newWikiTitle = ""

    @State private var newWikiSlug = ""

    var body: some View {
        Group {
            if viewModel.isLoading, viewModel.wikis.isEmpty {
                ProgressView()
            } else if viewModel.wikis.isEmpty {
                VStack(spacing: 12) {
                    Text("No wiki pages yet")
                        .foregroundStyle(.secondary)
                    Button("Create Page") {
                        showCreateSheet = true
                    }
                }
            } else {
                List {
                    Section {
                        let activeWikis = viewModel.wikis.filter { w in w.deletedAt == nil }
                        if activeWikis.isEmpty {
                            Text("No active pages")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(activeWikis) { wiki in
                            HStack(spacing: 8) {
                                if role.isAdmin {
                                    Button(action: { viewModel.toggleSelect(id: wiki._id) }) {
                                        Image(systemName: viewModel.selectedIDs.contains(wiki._id) ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(viewModel.selectedIDs.contains(wiki._id) ? .blue : .secondary)
                                            .accessibilityHidden(true)
                                    }
                                    .buttonStyle(.plain)
                                }
                                NavigationLink(value: wiki._id) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(wiki.title)
                                            .font(.headline)
                                        HStack {
                                            Text(wiki.slug)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                            Spacer()
                                            Text(wiki.status.displayName)
                                                .font(.caption2)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(wiki.status == .published ? Color.green.opacity(0.1) : Color.orange
                                                    .opacity(0.1))
                                                .clipShape(Capsule())
                                        }
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                    }
                    let deletedWikis = viewModel.wikis.filter { w in w.deletedAt != nil }
                    if !deletedWikis.isEmpty {
                        Section("Recently Deleted") {
                            ForEach(deletedWikis) { wiki in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(wiki.title)
                                            .font(.headline)
                                            .strikethrough()
                                            .foregroundStyle(.secondary)
                                        Text(wiki.slug)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("Restore") {
                                        viewModel.restoreWiki(orgID: orgID, id: wiki._id)
                                    }
                                    .buttonStyle(.bordered)
                                    .font(.caption)
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
                if role.isAdmin, !viewModel.selectedIDs.isEmpty {
                    HStack {
                        Text("\(viewModel.selectedIDs.count) selected")
                            .font(.subheadline)
                        Spacer()
                        Button("Clear") { viewModel.clearSelection() }
                            .font(.subheadline)
                        Button("Delete", role: .destructive) { viewModel.bulkDeleteWikis(orgID: orgID) }
                            .font(.subheadline)
                    }
                    .padding()
                    #if !SKIP
                        .background(.ultraThinMaterial)
                    #else
                        .background(Color.gray.opacity(0.15))
                    #endif
                }
            }
        }
        .navigationDestination(for: String.self) { wikiID in
            WikiEditView(orgID: orgID, wikiID: wikiID, role: role)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: { showCreateSheet = true }) {
                    Image(systemName: "plus")
                        .accessibilityHidden(true)
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            NavigationStack {
                Form {
                    TextField("Page Title", text: $newWikiTitle)
                    TextField("Slug (URL-friendly)", text: $newWikiSlug)
                }
                .navigationTitle("New Wiki Page")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showCreateSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") {
                            viewModel.createWiki(orgID: orgID, title: newWikiTitle, slug: newWikiSlug)
                            newWikiTitle = ""
                            newWikiSlug = ""
                            showCreateSheet = false
                        }
                        .disabled(newWikiTitle.trimmed.isEmpty || newWikiSlug.trimmed
                            .isEmpty)
                    }
                }
            }
        }
        .task {
            viewModel.start(orgID: orgID)
        }
        .onDisappear {
            viewModel.stop()
        }
    }
}

internal struct WikiEditView: View {
    let orgID: String

    let wikiID: String

    let role: OrgRole

    @State private var title = ""

    @State private var slug = ""

    @State private var content = ""

    @State private var status = WikiStatus.draft

    @State private var isLoading = true

    @State private var saveStatus = ""

    @State private var errorMessage: String?

    @State private var autoSaveTask: Task<Void, Never>?

    @State private var subscriptionID: String?
    @State private var editorsSub = Sub<[EditorEntry]>()
    @State private var membersSub = Sub<[OrgMemberEntry]>()
    @State private var selectedEditorID: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else {
                Form {
                    Section("Details") {
                        TextField("Title", text: $title)
                            .onChange(of: title) { scheduleSave() }
                        TextField("Slug", text: $slug)
                            .onChange(of: slug) { scheduleSave() }
                        Picker("Status", selection: $status) {
                            ForEach(WikiStatus.allCases, id: \.self) { s in
                                Text(s.displayName).tag(s)
                            }
                        }
                        .onChange(of: status) { scheduleSave() }
                    }

                    Section("Content") {
                        TextEditor(text: $content)
                            .frame(minHeight: 200)
                            .onChange(of: content) { scheduleSave() }
                    }

                    if !saveStatus.isEmpty {
                        Section {
                            Text(saveStatus)
                                .font(.caption)
                                .foregroundStyle(saveStatus == "Error saving" ? .red : .secondary)
                        }
                    }

                    if role.isAdmin {
                        Section("Editors") {
                            let editors = editorsSub.data ?? []
                            if editors.isEmpty {
                                Text("No editors assigned")
                                    .foregroundStyle(.secondary)
                            }
                            ForEach(editors) { editor in
                                HStack {
                                    Text(editor.name ?? editor.email ?? editor.userId)
                                    Spacer()
                                    Button(action: {
                                        Task {
                                            try? await WikiAPI.removeEditor(orgId: orgID, editorId: editor.userId, wikiId: wikiID)
                                        }
                                    }) {
                                        Image(systemName: "minus.circle.fill")
                                            .foregroundStyle(.red)
                                            .accessibilityHidden(true)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            let allMembers = membersSub.data ?? []
                            let editorIDs = Set((editorsSub.data ?? []).map(\.userId))
                            let available = allMembers.filter { m in !editorIDs.contains(m.userId) }
                            if !available.isEmpty {
                                HStack {
                                    Picker("Add editor", selection: $selectedEditorID) {
                                        #if !SKIP
                                        Text("Select member").tag(String?.none)
                                        ForEach(available) { m in
                                            Text(m.name ?? m.email ?? m.userId).tag(Optional(m.userId))
                                        }
                                        #else
                                        Text("Select member").tag(nil as String?)
                                        ForEach(available) { m in
                                            Text(m.name ?? m.email ?? m.userId).tag(m.userId as String?)
                                        }
                                        #endif
                                    }
                                    Button("Add") {
                                        guard let editorID = selectedEditorID else {
                                            return
                                        }

                                        Task {
                                            try? await WikiAPI.addEditor(orgId: orgID, editorId: editorID, wikiId: wikiID)
                                            selectedEditorID = nil
                                        }
                                    }
                                    .disabled(selectedEditorID == nil)
                                }
                            }
                        }
                        Section("Danger Zone") {
                            Button("Delete Page", role: .destructive) {
                                deleteWiki()
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Edit Wiki")
        .onAppear {
            loadWiki()
            editorsSub.bind { WikiAPI.subscribeEditors(orgId: orgID, wikiId: wikiID, onUpdate: $0, onError: $1) }
            membersSub.bind { OrgAPI.subscribeMembers(orgId: orgID, onUpdate: $0, onError: $1) }
        }
        .onDisappear {
            cancelSubscription(&subscriptionID)
            editorsSub.cancel()
            membersSub.cancel()
        }
    }

    private func scheduleSave() {
        autoSaveTask?.cancel()
        saveStatus = "Editing..."
        autoSaveTask = Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if !Task.isCancelled {
                await saveWiki()
            }
        }
    }

    private func saveWiki() async {
        saveStatus = "Saving..."
        do {
            try await WikiAPI.update(
                orgId: orgID,
                id: wikiID,
                content: content,
                slug: slug,
                status: status,
                title: title
            )
            saveStatus = "Saved"
        } catch {
            saveStatus = "Error saving"
            errorMessage = error.localizedDescription
        }
    }

    private func loadWiki() {
        subscriptionID = WikiAPI.subscribeRead(
            orgId: orgID,
            id: wikiID,
            onUpdate: { wiki in
                title = wiki.title
                slug = wiki.slug
                content = wiki.content ?? ""
                status = wiki.status
                isLoading = false
            },
            onError: { error in
                errorMessage = error.localizedDescription
                isLoading = false
            }
        )
    }

    private func deleteWiki() {
        Task {
            do {
                try await WikiAPI.rm(orgId: orgID, id: wikiID)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
