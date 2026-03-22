type RemoveIndexSignature<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K]
}
type StrictApi<T> = RemoveIndexSignature<{
  [K in keyof T]: T[K] extends Record<string, unknown> ? StrictApi<T[K]> : T[K]
}>
const strictApi = <T>(a: T): StrictApi<T> => a as unknown as StrictApi<T>
export type { StrictApi }
export { strictApi }
