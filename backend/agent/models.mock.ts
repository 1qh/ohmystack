import type { LanguageModel } from 'ai'
const mockModel = {
  doGenerate: ({ tools }: { tools?: { name: string }[] }) => {
    if (tools && tools.length > 0) {
      const [firstTool] = tools
      if (!firstTool)
        return {
          content: [{ text: 'Mock.', type: 'text' as const }],
          finishReason: 'stop' as const,
          usage: { inputTokens: 5, outputTokens: 10 },
          warnings: []
        }
      const mockArgs: Record<string, unknown> =
        firstTool.name === 'delegate'
          ? {
              description: 'Test task',
              isBackground: true,
              prompt: 'Test prompt'
            }
          : firstTool.name === 'webSearch'
            ? { query: 'test' }
            : firstTool.name === 'todoWrite'
              ? {
                  todos: [
                    {
                      content: 'Test task',
                      id: undefined,
                      position: 0,
                      priority: 'medium',
                      status: 'pending'
                    }
                  ]
                }
              : firstTool.name === 'taskStatus' || firstTool.name === 'taskOutput'
                ? { taskId: 'mock-task-id' }
                : firstTool.name === 'mcpCall'
                  ? {
                      serverName: 'test-server',
                      toolArgs: '{}',
                      toolName: 'test-tool'
                    }
                  : {}
      return {
        content: [
          {
            input: JSON.stringify(mockArgs),
            toolCallId: `mock-tc-${Date.now()}`,
            toolName: firstTool.name,
            type: 'tool-call' as const
          }
        ],
        finishReason: 'tool-calls' as const,
        usage: { inputTokens: 5, outputTokens: 10 },
        warnings: []
      }
    }
    return {
      content: [{ text: 'Mock response for testing.', type: 'text' as const }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 5, outputTokens: 10 },
      warnings: []
    }
  },
  doStream: () => ({
    stream: new ReadableStream({
      start: (c: ReadableStreamDefaultController) => {
        c.enqueue({ type: 'stream-start', warnings: [] })
        c.enqueue({ id: 'mock-text-0', type: 'text-start' })
        const words =
          'This is a mock response with enough content to make the chat scrollable and test streaming behavior properly across multiple lines of output'.split(
            ' '
          )
        for (const w of words) c.enqueue({ delta: `${w} `, id: 'mock-text-0', type: 'text-delta' })
        c.enqueue({ id: 'mock-text-0', type: 'text-end' })
        c.enqueue({
          finishReason: 'stop',
          type: 'finish',
          usage: { inputTokens: 5, outputTokens: 10 }
        })
        c.close()
      }
    })
  }),
  modelId: 'mock-model',
  provider: 'mock',
  specificationVersion: 'v3'
} as unknown as LanguageModel
export { mockModel }
