import ConvexCore
import DesktopShared
import Foundation
import SwiftCrossUI

internal final class TasksViewModel: SwiftCrossUI.ObservableObject, Performing {
    @SwiftCrossUI.Published var tasks = [TaskItem]()
    @SwiftCrossUI.Published var isLoading = true
    @SwiftCrossUI.Published var errorMessage: String?
    @SwiftCrossUI.Published var editors = [EditorEntry]()
    @SwiftCrossUI.Published var members = [OrgMemberEntry]()
    @SwiftCrossUI.Published var selectedIDs = Set<String>()
    @SwiftCrossUI.Published var editingTaskID: String?
    @SwiftCrossUI.Published var editTitle = ""
    @SwiftCrossUI.Published var editPriority: TaskItemPriority?

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

    func memberName(for userID: String) -> String {
        for m in members where m.userId == userID {
            return m.name ?? m.email ?? m.userId
        }
        return userID
    }

    @MainActor
    func load(orgID: String, projectID: String) async {
        await performLoading({ isLoading = $0 }) {
            tasks = try await TaskAPI.byProject(client, orgId: orgID, projectId: projectID)
            editors = try await ProjectAPI.editors(client, orgId: orgID, projectId: projectID)
            members = try await OrgAPI.members(client, orgId: orgID)
        }
    }

    @MainActor
    func createTask(orgID: String, projectID: String, title: String) async {
        await perform {
            try await TaskAPI.create(
                client,
                orgId: orgID,
                projectId: projectID,
                title: title
            )
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func toggleTask(orgID: String, projectID: String, taskID: String) async {
        await perform {
            try await TaskAPI.toggle(client, orgId: orgID, id: taskID)
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func deleteTask(orgID: String, projectID: String, id: String) async {
        await perform {
            try await TaskAPI.rm(client, orgId: orgID, id: id)
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func addEditor(orgID: String, editorId: String, projectID: String) async {
        await perform {
            try await ProjectAPI.addEditor(client, orgId: orgID, editorId: editorId, projectId: projectID)
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func removeEditor(orgID: String, editorId: String, projectID: String) async {
        await perform {
            try await ProjectAPI.removeEditor(client, orgId: orgID, editorId: editorId, projectId: projectID)
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func startEditing(task: TaskItem) {
        editingTaskID = task._id
        editTitle = task.title
        editPriority = task.priority
    }

    @MainActor
    func cancelEditing() {
        editingTaskID = nil
        editTitle = ""
        editPriority = nil
    }

    @MainActor
    func saveEdit(orgID: String, projectID: String) async {
        guard let taskID = editingTaskID else {
            return
        }

        let trimmed = editTitle.trimmed
        guard !trimmed.isEmpty else {
            return
        }

        await perform {
            try await TaskAPI.update(
                client,
                orgId: orgID,
                id: taskID,
                priority: editPriority,
                title: trimmed
            )
            editingTaskID = nil
            editTitle = ""
            editPriority = nil
            await self.load(orgID: orgID, projectID: projectID)
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
        if selectedIDs.count == tasks.count {
            selectedIDs.removeAll()
        } else {
            var ids = Set<String>()
            for t in tasks {
                ids.insert(t._id)
            }
            selectedIDs = ids
        }
    }

    @MainActor
    func clearSelection() {
        selectedIDs.removeAll()
    }

    @MainActor
    func bulkDeleteTasks(orgID: String, projectID: String) async {
        await perform {
            try await TaskAPI.rm(client, orgId: orgID, ids: Array(selectedIDs))
            selectedIDs.removeAll()
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func bulkMarkComplete(orgID: String, projectID: String) async {
        await perform {
            for id in selectedIDs {
                var found = false
                for t in tasks where t._id == id && t.completed != true {
                    found = true
                }
                if found {
                    try await TaskAPI.toggle(client, orgId: orgID, id: id)
                }
            }
            selectedIDs.removeAll()
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func bulkMarkIncomplete(orgID: String, projectID: String) async {
        await perform {
            for id in selectedIDs {
                var found = false
                for t in tasks where t._id == id && t.completed == true {
                    found = true
                }
                if found {
                    try await TaskAPI.toggle(client, orgId: orgID, id: id)
                }
            }
            selectedIDs.removeAll()
            await self.load(orgID: orgID, projectID: projectID)
        }
    }

    @MainActor
    func assignTask(orgID: String, projectID: String, taskID: String, assigneeId: String?) async {
        await perform {
            try await TaskAPI.assign(client, orgId: orgID, id: taskID, assigneeId: assigneeId)
            await self.load(orgID: orgID, projectID: projectID)
        }
    }
}

internal struct TasksView: View {
    let orgID: String
    let projectID: String
    let role: OrgRole
    @State private var viewModel = TasksViewModel()
    @State private var newTaskTitle = ""

    var body: some View {
        VStack {
            if role.isAdmin {
                editorsSection
            }

            bulkActionsBar
            if viewModel.isLoading {
                Text("Loading...")
            } else if let msg = viewModel.errorMessage {
                Text(msg)
                    .foregroundColor(.red)
            } else if viewModel.tasks.isEmpty {
                Text("No tasks yet")
            } else {
                taskList
            }

            newTaskBar
        }
        .task {
            await viewModel.load(orgID: orgID, projectID: projectID)
        }
    }

    private var editorsSection: some View {
        VStack {
            Text("Editors")
                .padding(.bottom, 4)
            if viewModel.editors.isEmpty {
                Text("No editors")
            } else {
                ForEach(viewModel.editors) { editor in
                    HStack {
                        Text(editor.name ?? editor.email ?? editor.userId)
                        Button("Remove") {
                            Task { await viewModel.removeEditor(orgID: orgID, editorId: editor.userId, projectID: projectID) }
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
                        Task { await viewModel.addEditor(orgID: orgID, editorId: member.userId, projectID: projectID) }
                    }
                }
            }
        }
    }

    private var bulkActionsBar: some View {
        HStack {
            Text("Tasks")
            Button(viewModel.selectedIDs.count == viewModel.tasks.count ? "Deselect All" : "Select All") {
                viewModel.toggleSelectAll()
            }
            if !viewModel.selectedIDs.isEmpty {
                Button("Mark Complete (\(viewModel.selectedIDs.count))") {
                    Task { await viewModel.bulkMarkComplete(orgID: orgID, projectID: projectID) }
                }
                Button("Mark Incomplete (\(viewModel.selectedIDs.count))") {
                    Task { await viewModel.bulkMarkIncomplete(orgID: orgID, projectID: projectID) }
                }
                Button("Delete Selected (\(viewModel.selectedIDs.count))") {
                    Task { await viewModel.bulkDeleteTasks(orgID: orgID, projectID: projectID) }
                }
            }
        }
        .padding(.bottom, 4)
    }

    private var taskList: some View {
        ScrollView {
            ForEach(viewModel.tasks) { task in
                VStack {
                    if viewModel.editingTaskID == task._id {
                        HStack {
                            TextField("Title", text: $viewModel.editTitle)
                            HStack {
                                ForEach(0..<TaskItemPriority.allCases.count, id: \.self) { idx in
                                    let p = TaskItemPriority.allCases[idx]
                                    Button(p == viewModel.editPriority ? "[\(p.displayName)]" : p.displayName) {
                                        viewModel.editPriority = viewModel.editPriority == p ? nil : p
                                    }
                                }
                            }
                            Button("Save") {
                                Task { await viewModel.saveEdit(orgID: orgID, projectID: projectID) }
                            }
                            Button("Cancel") {
                                viewModel.cancelEditing()
                            }
                        }
                    } else {
                        HStack {
                            Button(viewModel.selectedIDs.contains(task._id) ? "[x]" : "[ ]") {
                                viewModel.toggleSelect(id: task._id)
                            }
                            Button(task.completed == true ? "[x]" : "[ ]") {
                                Task { await viewModel.toggleTask(orgID: orgID, projectID: projectID, taskID: task._id) }
                            }
                            Text(task.title)
                            if let priority = task.priority {
                                Text(priority.displayName)
                            }
                            if let assigneeId = task.assigneeId {
                                Text(viewModel.memberName(for: assigneeId))
                            }
                            Button("Edit") {
                                viewModel.startEditing(task: task)
                            }
                            HStack {
                                Button("Unassigned") {
                                    Task { await viewModel.assignTask(
                                        orgID: orgID,
                                        projectID: projectID,
                                        taskID: task._id,
                                        assigneeId: nil
                                    )
                                    }
                                }
                                ForEach(viewModel.members) { member in
                                    Button(member.name ?? member.email ?? member.userId) {
                                        Task { await viewModel.assignTask(
                                            orgID: orgID,
                                            projectID: projectID,
                                            taskID: task._id,
                                            assigneeId: member.userId
                                        )
                                        }
                                    }
                                }
                            }
                            Button("Delete") {
                                Task { await viewModel.deleteTask(orgID: orgID, projectID: projectID, id: task._id) }
                            }
                        }
                    }
                }
                .padding(.bottom, 4)
            }
        }
    }

    private var newTaskBar: some View {
        HStack {
            TextField("New task...", text: $newTaskTitle)
            Button("Add") {
                let title = newTaskTitle.trimmed
                guard !title.isEmpty else {
                    return
                }

                Task {
                    await viewModel.createTask(orgID: orgID, projectID: projectID, title: title)
                    newTaskTitle = ""
                }
            }
        }
        .padding(.top, 4)
    }
}

internal final class ProjectEditViewModel: SwiftCrossUI.ObservableObject, Performing {
    @SwiftCrossUI.Published var name = ""
    @SwiftCrossUI.Published var projectDescription = ""
    @SwiftCrossUI.Published var status = ProjectStatus.active
    @SwiftCrossUI.Published var isLoading = true
    @SwiftCrossUI.Published var isSaving = false
    @SwiftCrossUI.Published var errorMessage: String?
    var updatedAt: Double?

    @MainActor
    func load(orgID: String, projectID: String) async {
        await performLoading({ isLoading = $0 }) {
            let project = try await ProjectAPI.read(client, orgId: orgID, id: projectID)
            name = project.name
            projectDescription = project.description ?? ""
            status = project.status ?? .active
            updatedAt = project.updatedAt
        }
    }

    @MainActor
    func save(orgID: String, projectID: String) async {
        await performLoading({ isSaving = $0 }) {
            try await ProjectAPI.update(
                client,
                orgId: orgID,
                id: projectID,
                description: projectDescription.trimmed.isEmpty ? nil : projectDescription.trimmed,
                name: name.trimmed,
                status: status,
                expectedUpdatedAt: updatedAt
            )
        }
    }

    @MainActor
    func deleteProject(orgID: String, projectID: String) async {
        await perform {
            try await ProjectAPI.rm(client, orgId: orgID, id: projectID)
        }
    }
}

internal struct ProjectEditView: View {
    let orgID: String
    let projectID: String
    var path: Binding<NavigationPath>
    @State private var viewModel = ProjectEditViewModel()

    var body: some View {
        VStack {
            if viewModel.isLoading {
                Text("Loading...")
            } else {
                TextField("Name", text: $viewModel.name)
                TextField("Description", text: $viewModel.projectDescription)
                HStack {
                    ForEach(0..<ProjectStatus.allCases.count, id: \.self) { idx in
                        let s = ProjectStatus.allCases[idx]
                        Button(s == viewModel.status ? "[\(s.displayName)]" : s.displayName) {
                            viewModel.status = s
                        }
                    }
                }

                if let msg = viewModel.errorMessage {
                    Text(msg)
                        .foregroundColor(.red)
                }

                HStack {
                    Button("Save") {
                        Task {
                            await viewModel.save(orgID: orgID, projectID: projectID)
                            if viewModel.errorMessage == nil {
                                path.wrappedValue.removeLast()
                            }
                        }
                    }
                    Button("Delete") {
                        Task {
                            await viewModel.deleteProject(orgID: orgID, projectID: projectID)
                            if viewModel.errorMessage == nil {
                                path.wrappedValue.removeLast()
                            }
                        }
                    }
                }
                .padding(.top, 4)

                if viewModel.isSaving {
                    Text("Saving...")
                }
            }
        }
        .task {
            await viewModel.load(orgID: orgID, projectID: projectID)
        }
    }
}
