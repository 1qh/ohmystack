'use client'

import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'

import { useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'

type SearchFn = FunctionReference<'query'>

interface UseSearchOptions {
  debounceMs?: number
  minLength?: number
}

interface UseSearchResult<T> {
  isSearching: boolean
  query: string
  results: T
  setQuery: (q: string) => void
}

const DEFAULT_DEBOUNCE_MS = 300,
  DEFAULT_MIN_LENGTH = 1,
