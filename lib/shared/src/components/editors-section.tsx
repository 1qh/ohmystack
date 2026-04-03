import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import { Avatar, AvatarFallback } from '@a/ui/avatar'
import { Button } from '@a/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@a/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@a/ui/select'
import { UserPlus, X } from 'lucide-react'
interface EditorInfo {
  email: string
  name: string
  userId: string
}
interface EditorsSectionLabels {
  addEditorPlaceholder?: string
  emptyState?: string
  title?: string
  unknownMember?: string
}
interface MemberInfo {
  user: null | {
    email?: string
    name?: string
  }
  userId: string
}
const EditorsSection = ({
  contentClassName,
  editorsList,
  emptyClassName,
  headerClassName,
  itemClassName,
  labels,
  members,
  onAdd,
  onRemove,
  triggerClassName,
  ...props
}: Omit<ComponentProps<typeof Card>, 'children'> & {
  contentClassName?: string
  editorsList: EditorInfo[]
  emptyClassName?: string
  headerClassName?: string
  itemClassName?: string
  labels?: EditorsSectionLabels
  members: MemberInfo[]
  onAdd: (userId: string) => void
  onRemove: (userId: string) => void
  triggerClassName?: string
}) => {
  const editorIds = new Set(editorsList.map(e => e.userId))
  const available: MemberInfo[] = []
  const title = labels?.title ?? 'Editors'
  const addEditorPlaceholder = labels?.addEditorPlaceholder ?? 'Add editor'
  const unknownMember = labels?.unknownMember ?? 'Unknown'
  const emptyState = labels?.emptyState ?? 'No editors assigned'
  for (const m of members) if (!editorIds.has(m.userId)) available.push(m)
  return (
    <Card {...props} data-testid='editors-section'>
      <CardHeader className={cn('flex flex-row items-center justify-between', headerClassName)}>
        <CardTitle>{title}</CardTitle>
        {available.length > 0 ? (
          <Select
            onValueChange={(v: null | string) => {
              if (v) onAdd(v)
            }}>
            <SelectTrigger className={cn('w-40', triggerClassName)} data-testid='add-editor-trigger'>
              <UserPlus className='mr-2 size-4' />
              <SelectValue placeholder={addEditorPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {available.map(m => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.user?.name ?? m.user?.email ?? unknownMember}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      {editorsList.length > 0 ? (
        <CardContent>
          <div className={cn('divide-y', contentClassName)}>
            {editorsList.map(e => (
              <div
                className={cn('flex items-center gap-3 py-2', itemClassName)}
                data-testid={`editor-item-${e.userId}`}
                key={e.userId}>
                <Avatar className='size-7'>
                  <AvatarFallback className='text-xs'>{e.name.slice(0, 2).toUpperCase() || '??'}</AvatarFallback>
                </Avatar>
                <span className='flex-1 text-sm'>{e.name || e.email}</span>
                <Button
                  data-testid={`remove-editor-${e.userId}`}
                  onClick={() => onRemove(e.userId)}
                  size='icon'
                  variant='ghost'>
                  <X className='size-4' />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      ) : (
        <CardContent>
          <p className={cn('text-sm text-muted-foreground', emptyClassName)}>{emptyState}</p>
        </CardContent>
      )}
    </Card>
  )
}
export default EditorsSection
