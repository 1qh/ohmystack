import ConvexShared
import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
internal final class TasksViewModel: Performing {
    let sub = Sub<[TaskItem]>()
    var mutationError: String?
    var selectedIDs = Set<String>()

    var tasks: [TaskItem] {
        sub.data ?? []
    }

    var isLoading: Bool {
        sub.isLoading
    }

    var errorMessage: String? {
        sub.error ?? mutationError
    }

    func start(orgID: String, projectID: String) {
        sub.bind { TaskAPI.subscribeByProject(orgId: orgID, projectId: projectID, onUpdate: $0, onError: $1) }
    }

    func stop() {
        sub.cancel()
    }

    func createTask(orgID: String, projectID: String, title: String) {
        perform { try await TaskAPI.create(orgId: orgID, projectId: projectID, title: title) }
    }

    func toggleTask(orgID: String, taskID: String) {
        perform { try await TaskAPI.toggle(orgId: orgID, id: taskID) }
    }

    func deleteTask(orgID: String, id: String) {
        perform { try await TaskAPI.rm(orgId: orgID, id: id) }
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

    func bulkDeleteTasks(orgID: String) {
        perform {
            try await TaskAPI.rm(orgId: orgID, ids: Array(self.selectedIDs))
            self.selectedIDs = Set<String>()
        }
    }

    func assignTask(orgID: String, taskID: String, assigneeID: String?) {
        perform { try await TaskAPI.assign(orgId: orgID, id: taskID, assigneeId: assigneeID) }
    }

    func updateTask(orgID: String, taskID: String, title: String, priority: TaskItemPriority?, updatedAt: Double) {
        perform { try await TaskAPI.update(orgId: orgID, id: taskID, priority: priority, title: title, expectedUpdatedAt: updatedAt) }
    }
}

internal struct PriorityBadge: View {
    let priority: TaskItemPriority
    private var priorityColor: Color {
        switch priority {
        case .high:
            .red

        case .medium:
            .orange

        case .low:
            .blue
        }
    }

    var body: some View {
        Text(priority.displayName)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(priorityColor.opacity(0.15))
            .foregroundStyle(priorityColor)
            .clipShape(Capsule())
    }
}

internal struct TasksView: View {
    let orgID: String
    let projectID: String
    let role: OrgRole

    @State private var viewModel = TasksViewModel()
    @State private var newTaskTitle = ""
    @State private var editorsSub = Sub<[EditorEntry]>()
    @State private var membersSub = Sub<[OrgMemberEntry]>()
    @State private var selectedEditorID: String?
    @State private var editingTask: TaskItem?
    @State private var editTitle = ""
    @State private var editPriority: TaskItemPriority?

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isLoading, viewModel.tasks.isEmpty {
                Spacer()
                ProgressView()
                Spacer()
            } else {
                List {
                    ForEach(viewModel.tasks) { task in
                        HStack {
                            if role.isAdmin {
                                Button(action: { viewModel.toggleSelect(id: task._id) }) {
                                    Image(systemName: viewModel.selectedIDs.contains(task._id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(viewModel.selectedIDs.contains(task._id) ? .blue : .secondary)
                                        .accessibilityHidden(true)
                                }
                                .buttonStyle(.plain)
                            }
                            Button(action: {
                                viewModel.toggleTask(orgID: orgID, taskID: task._id)
                            }) {
                                Image(systemName: task.completed == true ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(task.completed == true ? .green : .secondary)
                                    .accessibilityHidden(true)
                            }
                            .accessibilityIdentifier("toggleTask")
                            .buttonStyle(.plain)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(task.title)
                                    .strikethrough(task.completed == true)
                                    .foregroundStyle(task.completed == true ? .secondary : .primary)
                                if let priority = task.priority {
                                    PriorityBadge(priority: priority)
                                }
                            }
                            Spacer()
                            Button(action: {
                                editTitle = task.title
                                editPriority = task.priority
                                editingTask = task
                            }) {
                                Image(systemName: "pencil")
                                    .foregroundStyle(.blue)
                                    .accessibilityHidden(true)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("editTask")
                            TaskAssigneePicker(
                                task: task,
                                members: membersSub.data ?? []
                            ) { assigneeID in
                                viewModel.assignTask(orgID: orgID, taskID: task._id, assigneeID: assigneeID)
                            }
                            .accessibilityIdentifier("taskAssignee")
                        }
                        .padding(.vertical, 2)
                    }

                    if role.isAdmin {
                        editorsSection
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
                        Button("Delete", role: .destructive) { viewModel.bulkDeleteTasks(orgID: orgID) }
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

            HStack(spacing: 8) {
                TextField("New task...", text: $newTaskTitle)
                    .roundedBorderTextField()
                    .onSubmit { addTask() }
                Button(action: addTask) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .accessibilityHidden(true)
                }
                .accessibilityIdentifier("addTaskButton")
                .disabled(newTaskTitle.trimmed.isEmpty)
            }
            .padding()
        }
        .navigationTitle("Tasks")
        .task {
            viewModel.start(orgID: orgID, projectID: projectID)
            editorsSub.bind { ProjectAPI.subscribeEditors(orgId: orgID, projectId: projectID, onUpdate: $0, onError: $1) }
            membersSub.bind { OrgAPI.subscribeMembers(orgId: orgID, onUpdate: $0, onError: $1) }
        }
        .onDisappear {
            viewModel.stop()
            editorsSub.cancel()
            membersSub.cancel()
        }
        .sheet(
            isPresented: Binding(
                get: { editingTask != nil },
                set: { newValue in
                    if !newValue {
                        editingTask = nil
                    }
                }
            )
        ) {
            editTaskSheet
        }
    }

    private var editTaskSheet: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $editTitle)
                    .accessibilityIdentifier("editTaskTitle")
                Picker("Priority", selection: $editPriority) {
                    #if !SKIP
                    Text("None").tag(TaskItemPriority?.none)
                    ForEach(TaskItemPriority.allCases, id: \.rawValue) { p in
                        Text(p.displayName).tag(Optional(p))
                    }
                    #else
                    Text("None").tag(nil as TaskItemPriority?)
                    ForEach(TaskItemPriority.allCases, id: \.self) { p in
                        Text(p.displayName).tag(p as TaskItemPriority?)
                    }
                    #endif
                }
                .accessibilityIdentifier("editTaskItemPriority")
            }
            .navigationTitle("Edit Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { editingTask = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let task = editingTask {
                            viewModel.updateTask(
                                orgID: orgID,
                                taskID: task._id,
                                title: editTitle,
                                priority: editPriority,
                                updatedAt: task.updatedAt
                            )
                        }
                        editingTask = nil
                    }
                    .disabled(editTitle.trimmed.isEmpty)
                }
            }
        }
    }

    private var editorsSection: some View {
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
                            try? await ProjectAPI.removeEditor(orgId: orgID, editorId: editor.userId, projectId: projectID)
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
                            try? await ProjectAPI.addEditor(orgId: orgID, editorId: editorID, projectId: projectID)
                            selectedEditorID = nil
                        }
                    }
                    .disabled(selectedEditorID == nil)
                }
            }
        }
    }

    private func addTask() {
        let title = newTaskTitle.trimmed
        guard !title.isEmpty else {
            return
        }

        viewModel.createTask(orgID: orgID, projectID: projectID, title: title)
        newTaskTitle = ""
    }
}

internal struct TaskAssigneePicker: View {
    let task: TaskItem
    let members: [OrgMemberEntry]
    let onAssign: (String?) -> Void
    var body: some View {
        Menu {
            Button(action: { onAssign(nil) }) {
                Label("Unassigned", systemImage: task.assigneeId == nil ? "checkmark" : "")
            }
            ForEach(members) { m in
                Button(action: { onAssign(m.userId) }) {
                    Label(
                        m.name ?? m.email ?? m.userId,
                        systemImage: task.assigneeId == m.userId ? "checkmark" : ""
                    )
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "person.circle")
                    .foregroundStyle(task.assigneeId != nil ? .blue : .secondary)
                    .accessibilityHidden(true)
                Text(assigneeName(for: task.assigneeId))
                    .font(.caption)
                    .foregroundStyle(task.assigneeId != nil ? .primary : .secondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    private func assigneeName(for id: String?) -> String {
        guard let id else {
            return "Unassigned"
        }

        for m in members where m.userId == id {
            return m.name ?? m.email ?? m.userId
        }
        return "Unknown"
    }
}
