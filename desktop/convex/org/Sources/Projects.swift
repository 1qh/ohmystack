import ConvexCore
import DesktopShared
import Foundation
import SwiftCrossUI

internal final class ProjectsViewModel: SwiftCrossUI.ObservableObject, Performing {
    @SwiftCrossUI.Published var projects = [Project]()
    @SwiftCrossUI.Published var isLoading = true
    @SwiftCrossUI.Published var errorMessage: String?
    @SwiftCrossUI.Published var selectedIDs = Set<String>()

    @MainActor
    func load(orgID: String) async {
        await performLoading({ isLoading = $0 }) {
            let result = try await ProjectAPI.list(
                client,
                orgId: orgID
            )
            projects = result.page
        }
    }

    @MainActor
    func createProject(orgID: String, name: String, description: String) async {
        await perform {
            try await ProjectAPI.create(
                client,
                orgId: orgID,
                description: description.isEmpty ? nil : description,
                name: name
            )
            await self.load(orgID: orgID)
        }
    }

    @MainActor
    func deleteProject(orgID: String, id: String) async {
        await perform {
            try await ProjectAPI.rm(client, orgId: orgID, id: id)
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
        if selectedIDs.count == projects.count {
            selectedIDs.removeAll()
        } else {
            var ids = Set<String>()
            for p in projects {
                ids.insert(p._id)
            }
            selectedIDs = ids
        }
    }

    @MainActor
    func clearSelection() {
        selectedIDs.removeAll()
    }

    @MainActor
    func bulkDeleteProjects(orgID: String) async {
        await perform {
            try await ProjectAPI.rm(client, orgId: orgID, ids: Array(selectedIDs))
            selectedIDs.removeAll()
            await self.load(orgID: orgID)
        }
    }
}

internal struct ProjectsView: View {
    let orgID: String
    let role: OrgRole
    var path: Binding<NavigationPath>
    @State private var viewModel = ProjectsViewModel()
    @State private var showCreateForm = false
    @State private var newName = ""
    @State private var newDesc = ""

    var body: some View {
        VStack {
            HStack {
                Text("Projects")
                Button("New Project") { showCreateForm = true }
                if role.isAdmin {
                    Button(viewModel.selectedIDs.count == viewModel.projects.count ? "Deselect All" : "Select All") {
                        viewModel.toggleSelectAll()
                    }
                    if !viewModel.selectedIDs.isEmpty {
                        Button("Delete Selected (\(viewModel.selectedIDs.count))") {
                            Task { await viewModel.bulkDeleteProjects(orgID: orgID) }
                        }
                    }
                }
            }
            .padding(.bottom, 4)

            if showCreateForm {
                VStack {
                    TextField("Project Name", text: $newName)
                    TextField("Description (optional)", text: $newDesc)
                    HStack {
                        Button("Cancel") { showCreateForm = false }
                        Button("Create") {
                            Task {
                                await viewModel.createProject(orgID: orgID, name: newName, description: newDesc)
                                newName = ""
                                newDesc = ""
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
            } else if viewModel.projects.isEmpty {
                Text("No projects yet")
            } else {
                ScrollView {
                    ForEach(viewModel.projects) { project in
                        HStack {
                            if role.isAdmin {
                                Button(viewModel.selectedIDs.contains(project._id) ? "[x]" : "[ ]") {
                                    viewModel.toggleSelect(id: project._id)
                                }
                            }
                            VStack {
                                Text(project.name)
                                if let desc = project.description, !desc.isEmpty {
                                    Text(desc)
                                }
                                if let status = project.status {
                                    Text(status.displayName)
                                }
                            }
                            Button("Delete") {
                                Task { await viewModel.deleteProject(orgID: orgID, id: project._id) }
                            }
                            NavigationLink("Tasks", value: project._id, path: path)
                            NavigationLink("Edit", value: "edit:\(project._id)", path: path)
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
