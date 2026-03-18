/* oxlint-disable react-perf/jsx-no-new-array-as-prop */
// biome-ignore-all lint/nursery/noFloatingPromises: event handler

'use client'

import type { OrgMember, Project, Task } from '@a/be-spacetimedb/spacetimedb/types'
import type { SyntheticEvent } from 'react'
import type { output } from 'zod/v4'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { s } from '@a/be-spacetimedb/t'
import { sameIdentity } from '@a/fe/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@a/ui/avatar'
import { Badge } from '@a/ui/badge'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Checkbox } from '@a/ui/checkbox'
import { Input } from '@a/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@a/ui/select'
import { Skeleton } from '@a/ui/skeleton'
import { EditorsSection } from '@noboil/spacetimedb/components'
import { noop, useBulkMutate, useMut } from '@noboil/spacetimedb/react'
import { enumToOptions } from '@noboil/spacetimedb/zod'
import { Check, Pencil, Plus, Trash, X } from 'lucide-react'
import Link from 'next/link'
import { use, useState } from 'react'
import { toast } from 'sonner'
import { useSpacetimeDB } from 'spacetimedb/react'

import { useOrg } from '~/hook/use-org'
import { useOrgTable } from '~/hook/use-org-table'
import { useProfileMap } from '~/hook/use-profile-map'

type Priority = NonNullable<output<typeof s.task>['priority']>

const priorityOptions = enumToOptions(s.task.shape.priority.unwrap()),
  asPriority = (value: string | undefined): Priority =>
    value === 'high' || value === 'low' || value === 'medium' ? value : 'medium',
  PrioritySelect = ({ onValueChange, value }: { onValueChange: (v: Priority) => void; value: Priority }) => (
    <Select onValueChange={v => onValueChange(v as Priority)} value={value}>
      <SelectTrigger className='w-28'>
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
  members: OrgMember[]
  onAssign: (userId: null | string) => void
  onDelete: () => void
  onToggle: () => void
  onUpdate: (title: string, priority: Priority) => Promise<void>
  task: Task
}

const TaskRow = ({ canAssign, canEdit, members, onAssign, onDelete, onToggle, onUpdate, task: t }: TaskRowProps) => {
    const [editing, setEditing] = useState(false),
      [editTitle, setEditTitle] = useState(() => t.title),
      [editPriority, setEditPriority] = useState<Priority>(() => asPriority(t.priority)),
      handleSave = async () => {
        if (!editTitle.trim()) return

        await onUpdate(editTitle, editPriority)
        setEditing(false)
        toast.success('Task updated')
      },
      handleCancel = () => {
        setEditTitle(t.title)
        setEditPriority(asPriority(t.priority))
        setEditing(false)
      },
      { assigneeId } = t,
      assignee = assigneeId ? members.find(m => sameIdentity(m.userId, assigneeId)) : null

    if (editing)
      return (
        <div className='flex items-center gap-2 py-2'>
          <Input className='flex-1' onChange={e => setEditTitle(e.target.value)} value={editTitle} />
          <PrioritySelect onValueChange={setEditPriority} value={editPriority} />
          <Button
            onClick={() => {
              handleSave()
            }}
            size='icon'
            variant='ghost'>
            <Check className='size-4 text-green-600' />
          </Button>
          <Button onClick={handleCancel} size='icon' variant='ghost'>
            <X className='size-4 text-red-600' />
          </Button>
        </div>
      )

    return (
      <div className='flex items-center gap-3 py-2'>
        <Checkbox checked={Boolean(t.completed)} disabled={!canEdit} onCheckedChange={onToggle} />
        <span className={t.completed ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{t.title}</span>
        <span className='text-xs text-muted-foreground'>{t.priority}</span>
        {canAssign ? (
          <Select
            onValueChange={v => onAssign(v === 'none' ? null : v)}
            value={assigneeId ? assigneeId.toHexString() : 'none'}>
            <SelectTrigger className='w-32'>
              <SelectValue placeholder='Unassigned' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>Unassigned</SelectItem>
              {members.map(m => (
                <SelectItem key={m.id} value={m.userId.toHexString()}>
                  {m.userId.toHexString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : assignee ? (
          <div className='flex items-center gap-1'>
            <Avatar className='size-5'>
              <AvatarImage src={undefined} />
              <AvatarFallback className='text-xs'>{assignee.userId.toHexString().slice(2, 4)}</AvatarFallback>
            </Avatar>
            <span className='text-xs text-muted-foreground'>{assignee.userId.toHexString()}</span>
          </div>
        ) : null}
        {canEdit ? (
          <>
            <Button onClick={() => setEditing(true)} size='icon' variant='ghost'>
              <Pencil className='size-4' />
            </Button>
            <Button onClick={onDelete} size='icon' variant='ghost'>
              <Trash className='size-4' />
            </Button>
          </>
        ) : null}
      </div>
    )
  },
  ProjectDetailPage = ({ params }: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = use(params),
      pid = Number(projectId),
      { isAdmin, org } = useOrg(),
      { identity } = useSpacetimeDB(),
      [allProjects] = useOrgTable<Project>(tables.project),
      [allTasks] = useOrgTable<Task>(tables.task),
      [members] = useOrgTable<OrgMember>(tables.orgMember),
      profileByUserId = useProfileMap(),
      project = allProjects.find(p => p.id === pid),
      tasks = allTasks.filter(t => t.projectId === pid),
      [title, setTitle] = useState(''),
      createTask = useMut(reducers.createTask, {
        onSuccess: () => setTitle(''),
        toast: { success: 'Task added' }
      }),
      updateTask = useMut(reducers.updateTask),
      removeTask = useMut(reducers.rmTask, { toast: { success: 'Task deleted' } }),
      [priority, setPriority] = useState<Priority>('medium'),
      [selected, setSelected] = useState<Set<number>>(() => new Set()),
      bulkDelete = useBulkMutate(removeTask, {
        onSuccess: () => setSelected(new Set()),
        toast: {
          loading: p => `Deleting tasks: ${p.succeeded + p.failed}/${p.total}`,
          success: count => `${count} task(s) deleted`
        }
      }),
      bulkUpdate = useBulkMutate(updateTask, {
        onSuccess: () => setSelected(new Set()),
        toast: {
          loading: p => `Updating tasks: ${p.succeeded + p.failed}/${p.total}`,
          success: count => `${count} task(s) updated`
        }
      })

    if (!(project && identity)) return <Skeleton className='h-40' />

    const canEditProject =
        isAdmin || sameIdentity(project.userId, identity) || (project.editors ?? []).some(e => sameIdentity(e, identity)),
      editorsList = (project.editors ?? []).map(e => {
        const userId = e.toHexString(),
          profile = profileByUserId.get(userId)
        return { email: '', name: profile?.displayName ?? userId.slice(0, 8), userId }
      }),
      membersForEditors = members.map(m => {
        const userId = m.userId.toHexString(),
          profile = profileByUserId.get(userId)
        return { user: { email: undefined, name: profile?.displayName }, userId }
      }),
      doAddTask = async () => {
        if (!title.trim()) return
        await createTask({
          completed: false,
          orgId: Number(org._id),
          priority,
          projectId: pid,
          title
        })
      },
      handleAddTask = (e: SyntheticEvent) => {
        e.preventDefault()
        doAddTask()
      },
      handleToggle = (id: number) => {
        const current = tasks.find(t => t.id === id)
        if (!current) return
        updateTask({ completed: !current.completed, expectedUpdatedAt: current.updatedAt, id })
      },
      toggleSelect = (id: number) => {
        setSelected(prev => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      },
      toggleSelectAll = () => {
        if (selected.size === tasks.length) setSelected(new Set())
        else setSelected(new Set(tasks.map(t => t.id)))
      },
      handleBulkDelete = () => {
        if (selected.size === 0) return
        const items: { id: number }[] = []
        for (const id of selected) items.push({ id })
        bulkDelete.run(items)
      },
      handleBulkComplete = (completed: boolean) => {
        if (selected.size === 0) return
        const items: Parameters<typeof updateTask>[0][] = []
        for (const id of selected) {
          const current = tasks.find(t => t.id === id)
          if (current) items.push({ completed, expectedUpdatedAt: current.updatedAt, id })
        }
        bulkUpdate.run(items)
      }

    return (
      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-bold'>{project.name}</h1>
            {canEditProject ? null : <Badge variant='secondary'>View only</Badge>}
          </div>
          {canEditProject ? (
            <Button asChild variant='outline'>
              <Link href={`/projects/${projectId}/edit`}>
                <Pencil className='mr-2 size-4' />
                Edit
              </Link>
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
                <Button onClick={handleBulkDelete} size='sm' variant='destructive'>
                  Delete
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className='space-y-4'>
            {canEditProject ? (
              <form className='flex gap-2' onSubmit={handleAddTask}>
                <Input
                  className='flex-1'
                  onChange={e => setTitle(e.target.value)}
                  placeholder='New task...'
                  value={title}
                />
                <PrioritySelect onValueChange={setPriority} value={priority} />
                <Button type='submit'>
                  <Plus className='size-4' />
                </Button>
              </form>
            ) : null}

            <div className='divide-y'>
              {isAdmin && tasks.length > 0 ? (
                <div className='flex items-center gap-3 py-2 text-sm text-muted-foreground'>
                  <Checkbox
                    checked={selected.size === tasks.length && tasks.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span>Select all</span>
                </div>
              ) : null}
              {tasks.map(t => {
                const isTaskCreator = sameIdentity(t.userId, identity),
                  canEdit = isTaskCreator || canEditProject
                return (
                  <div className='flex items-center gap-2' key={t.id}>
                    {isAdmin ? <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /> : null}
                    <div className='flex-1'>
                      <TaskRow
                        canAssign={canEditProject}
                        canEdit={canEdit}
                        members={members}
                        onAssign={userId => {
                          const assignee = userId
                            ? members.find(m => m.userId.toHexString() === userId)?.userId
                            : undefined
                          updateTask({ assigneeId: assignee, expectedUpdatedAt: t.updatedAt, id: t.id })
                        }}
                        onDelete={() => {
                          removeTask({ id: t.id })
                        }}
                        onToggle={() => handleToggle(t.id)}
                        onUpdate={async (newTitle, newPriority) => {
                          await updateTask({
                            expectedUpdatedAt: t.updatedAt,
                            id: t.id,
                            priority: newPriority,
                            title: newTitle
                          })
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
          <EditorsSection editorsList={editorsList} members={membersForEditors} onAdd={noop} onRemove={noop} />
        ) : null}
      </div>
    )
  }

export default ProjectDetailPage
