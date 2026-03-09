'use client'

import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import { useMutation } from 'convex/react'
import { useCallback, useRef, useState } from 'react'

type Args<T extends MutationFn> = OptionalRestArgs<T>[0]
type MutationFn = FunctionReference<'mutation'>

interface OptimisticOptions<T extends MutationFn, R = FunctionReturnType<T>> {
  mutation: T
  onOptimistic?: (args: Args<T>) => void
  onRollback?: (args: Args<T>, catchError: Error) => void
  onSuccess?: (result: R, args: Args<T>) => void
}

