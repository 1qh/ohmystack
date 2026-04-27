/* oxlint-disable promise/prefer-await-to-then */
/* oxlint-disable forbid-component-props, no-underscore-dangle -- shadcn/Tailwind pattern requires className/style on shared components / Convex framework owns _id/_creationTime; SpacetimeDB owns _ctx — both unavoidable framework-side conventions */
'use client'
import type { Doc, Id } from '@a/be-convex/model'
import type { FunctionReturnType } from 'convex/server'
import type { output } from 'zod/v4'
import { api } from '@a/be-convex'
import { orgScoped } from '@a/be-convex/s'
import { fail } from '@a/fe/utils'
import { cn } from '@a/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/avatar'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Checkbox } from '@a/ui/checkbox'
import { Input } from '@a/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@a/ui/select'
import { Skeleton } from '@a/ui/skeleton'
import { useQuery } from 'convex/react'
import { Check, Pencil, Plus, Trash, X } from 'lucide-react'
import Link from 'next/link'
import { EditorsSection } from 'noboil/convex/components'
import { canEditResource, useBulkMutate, useOrgMutation, useOrgQuery } from 'noboil/convex/react'
import { enumToOptions } from 'noboil/convex/zod'
import { use, useState } from 'react'
import { toast } from 'sonner'
import { useOrg } from '~/hook/use-org'
type Member = FunctionReturnType<typeof api.org.members>[number]
type Priority = NonNullable<output<typeof orgScoped.task>['priority']>
const priorityOptions = enumToOptions(orgScoped.task.shape.priority.unwrap())
const asPriority = (value: string): Priority =>
  value === 'high' || value === 'low' || value === 'medium' ? value : 'medium'
const PrioritySelect = ({ onValueChange, value }: { onValueChange: (v: Priority) => void; value: Priority }) => (
  <Select
    onValueChange={(v: null | string) => {
      if (v) onValueChange(asPriority(v))
    }}
    value={value}>
    <SelectTrigger aria-label='Priority' className='w-28'>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {priorityOptions.map(o => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
interface TaskRowProps {
  canAssign: boolean
  canEdit: boolean
  members: Member[]
  onAssign: (userId: Id<'users'> | null) => void
  onDelete: () => void
  onToggle: () => void
  onUpdate: (title: string, priority: Priority) => Promise<void>
  task: Doc<'task'>
}
const TaskRow = ({ canAssign, canEdit, members, onAssign, onDelete, onToggle, onUpdate, task: t }: TaskRowProps) => {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(t.title)
  const [editPriority, setEditPriority] = useState<Priority>(t.priority ?? 'medium')
  const handleSave = () => {
    if (!editTitle.trim()) return
    onUpdate(editTitle, editPriority)
      .then(() => {
        setEditing(false)
        toast.success('Task updated')
        return null
      })
      .catch(fail)
  }
  const handleCancel = () => {
    setEditTitle(t.title)
    setEditPriority(t.priority ?? 'medium')
    setEditing(false)
  }
  const { assigneeId } = t
  const assignee = assigneeId ? members.find(m => m.userId === assigneeId) : null
  if (editing)
    return (
      <div className='flex items-center gap-2 py-2'>
        <Input className='flex-1' onChange={e => setEditTitle(e.target.value)} value={editTitle} />
        <PrioritySelect onValueChange={setEditPriority} value={editPriority} />
        <Button aria-label='Save' onClick={handleSave} size='icon' variant='ghost'>
          <Check className='size-4 text-primary' />
        </Button>
        <Button aria-label='Cancel' onClick={handleCancel} size='icon' variant='ghost'>
          <X className='size-4 text-destructive' />
        </Button>
      </div>
    )
  return (
    <div className='flex items-center gap-3 py-2'>
      <Checkbox checked={Boolean(t.completed)} disabled={!canEdit} onCheckedChange={onToggle} />
      <span className={cn(t.completed ? 'flex-1 text-muted-foreground line-through' : 'flex-1')}>{t.title}</span>
      <span className='text-xs text-muted-foreground'>{t.priority}</span>
      {canAssign ? (
        <Select
          onValueChange={v => onAssign(members.find(m => m.userId === v)?.userId ?? null)}
          value={assigneeId ?? 'none'}>
          <SelectTrigger aria-label='Assignee' className='w-32'>
            <SelectValue placeholder='Unassigned' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>Unassigned</SelectItem>
            {members.map(m => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.user?.name ?? 'Unknown'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : assignee ? (
        <div className='flex items-center gap-1'>
          <Avatar className='size-5'>
            {assignee.user?.image ? <AvatarImage src={assignee.user.image} /> : null}
            <AvatarFallback className='bg-foreground text-xs text-background'>
              {assignee.user?.name?.[0] ?? '?'}
            </AvatarFallback>
          </Avatar>
          <span className='text-xs text-muted-foreground'>{assignee.user?.name}</span>
        </div>
      ) : null}
      {canEdit ? (
        <>
          <Button aria-label='Edit task' onClick={() => setEditing(true)} size='icon' variant='ghost'>
            <Pencil className='size-4' />
          </Button>
          <Button aria-label='Delete task' onClick={onDelete} size='icon' variant='ghost'>
            <Trash className='size-4' />
          </Button>
        </>
      ) : null}
    </div>
  )
}
const ProjectDetailPage = ({ params }: { params: Promise<{ projectId: Id<'project'> }> }) => {
  const { projectId } = use(params)
  const { isAdmin } = useOrg()
  const me = useQuery(api.user.me, {})
  const project = useOrgQuery(api.project.read, { id: projectId })
  const tasks = useOrgQuery(api.task.byProject, { projectId })
  const members = useOrgQuery(api.org.members)
  const editorsList = useOrgQuery(api.project.editors, { projectId })
  const createTask = useOrgMutation(api.task.create)
  const updateTask = useOrgMutation(api.task.update)
  const removeTask = useOrgMutation(api.task.rm)
  const toggleTask = useOrgMutation(api.task.toggle)
  const assignTask = useOrgMutation(api.task.assign)
  const addEditorMut = useOrgMutation(api.project.addEditor)
  const removeEditorMut = useOrgMutation(api.project.removeEditor)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [selected, setSelected] = useState<Set<Id<'task'>>>(() => new Set())
  const bulkDelete = useBulkMutate(async (id: Id<'task'>) => removeTask({ id }), {
    toast: { error: 'Bulk delete failed', success: n => `${n} task(s) deleted` }
  })
  const bulkUpdate = useBulkMutate(
    async (args: { completed: boolean; id: Id<'task'> }) => updateTask({ completed: args.completed, id: args.id }),
    { toast: { error: 'Bulk update failed', success: n => `${n} task(s) updated` } }
  )
  if (!(project && tasks && me && members && editorsList)) return <Skeleton className='h-40' />
  const canEditProject = canEditResource({ editorsList, isAdmin, resource: project, userId: me._id })
  const doAddTask = async () => {
    if (!title.trim()) return
    try {
      await createTask({ completed: false, priority, projectId, title })
      setTitle('')
      toast.success('Task added')
    } catch (error) {
      fail(error)
    }
  }
  const handleAddTask = (e: React.SyntheticEvent) => {
    e.preventDefault()
    doAddTask().catch(fail)
  }
  const handleToggle = (id: Id<'task'>) => {
    toggleTask({ id }).catch(fail)
  }
  const handleDeleteTask = (id: Id<'task'>) => {
    removeTask({ id })
      .then(() => toast.success('Task deleted'))
      .catch(fail)
  }
  const toggleSelect = (id: Id<'task'>) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selected.size === tasks.length) setSelected(new Set())
    else setSelected(new Set(tasks.map(t => t._id)))
  }
  const handleBulkDelete = () => {
    if (selected.size === 0) return
    bulkDelete
      .run([...selected])
      .then(() => {
        setSelected(new Set())
        return null
      })
      .catch(fail)
  }
  const handleBulkComplete = (completed: boolean) => {
    if (selected.size === 0) return
    const items: { completed: boolean; id: Id<'task'> }[] = []
    for (const id of selected) items.push({ completed, id })
    bulkUpdate
      .run(items)
      .then(() => {
        setSelected(new Set())
        return null
      })
      .catch(fail)
  }
  const handleAddEditor = (userId: string) => {
    addEditorMut({ editorId: userId, projectId })
      .then(() => toast.success('Editor added'))
      .catch(fail)
  }
  const handleRemoveEditor = (userId: string) => {
    removeEditorMut({ editorId: userId, projectId })
      .then(() => toast.success('Editor removed'))
      .catch(fail)
  }
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <h1 className='text-2xl font-bold'>{project.name}</h1>
          {canEditProject ? null : <Badge variant='secondary'>View only</Badge>}
        </div>
        {canEditProject ? (
          <Button
            nativeButton={false}
            render={p => <Link {...p} href={`/projects/${projectId}/edit`} />}
            variant='outline'>
            <Pencil className='mr-2 size-4' />
            Edit
          </Button>
        ) : null}
      </div>
      {project.description ? <p className='text-muted-foreground'>{project.description}</p> : null}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle>Tasks</CardTitle>
          {isAdmin && selected.size > 0 ? (
            <div className='flex items-center gap-2'>
              <span className='text-sm text-muted-foreground'>{selected.size} selected</span>
              <Button onClick={() => handleBulkComplete(true)} size='sm' variant='outline'>
                Mark Complete
              </Button>
              <Button onClick={() => handleBulkComplete(false)} size='sm' variant='outline'>
                Mark Incomplete
              </Button>
              <Button
                className='!text-destructive-foreground border-destructive! bg-destructive! hover:bg-destructive/90! focus-visible:border-destructive! focus-visible:ring-destructive! dark:bg-destructive! dark:hover:bg-destructive/90!'
                onClick={handleBulkDelete}
                size='sm'
                variant='destructive'>
                Delete
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className='space-y-4'>
          {canEditProject ? (
            <form className='flex gap-2' onSubmit={handleAddTask}>
              <Input className='flex-1' onChange={e => setTitle(e.target.value)} placeholder='New task...' value={title} />
              <PrioritySelect onValueChange={setPriority} value={priority} />
              <Button aria-label='Add task' type='submit'>
                <Plus className='size-4' />
              </Button>
            </form>
          ) : null}
          <div className='divide-y'>
            {isAdmin && tasks.length > 0 ? (
              <div className='flex items-center gap-3 py-2 text-sm text-muted-foreground'>
                <Checkbox checked={selected.size === tasks.length && tasks.length > 0} onCheckedChange={toggleSelectAll} />
                <span>Select all</span>
              </div>
            ) : null}
            {tasks.map(t => {
              const isTaskCreator = t.userId === me._id
              const canEdit = isTaskCreator || canEditProject
              return (
                <div className='flex items-center gap-2' key={t._id}>
                  {isAdmin ? <Checkbox checked={selected.has(t._id)} onCheckedChange={() => toggleSelect(t._id)} /> : null}
                  <div className='flex-1'>
                    <TaskRow
                      canAssign={canEditProject}
                      canEdit={canEdit}
                      members={members}
                      onAssign={userId => {
                        assignTask({ assigneeId: userId ?? undefined, id: t._id }).catch(fail)
                      }}
                      onDelete={() => handleDeleteTask(t._id)}
                      onToggle={() => handleToggle(t._id)}
                      onUpdate={async (newTitle, newPriority) => {
                        await updateTask({ id: t._id, priority: newPriority, title: newTitle })
                      }}
                      task={t}
                    />
                  </div>
                </div>
              )
            })}
            {tasks.length === 0 && <p className='py-4 text-center text-muted-foreground'>No tasks yet</p>}
          </div>
        </CardContent>
      </Card>
      {isAdmin ? (
        <EditorsSection
          editorsList={editorsList}
          members={members}
          onAdd={handleAddEditor}
          onRemove={handleRemoveEditor}
        />
      ) : null}
    </div>
  )
}
export default ProjectDetailPage
