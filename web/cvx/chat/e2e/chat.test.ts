// oxlint-disable max-statements
// biome-ignore-all lint/performance/useTopLevelRegex: x
import { expect, test } from './fixtures'
import { login } from './helpers'

const CHAT_URL_PATTERN = /\/[a-z0-9]+/u

test.describe('New Chat Page', () => {
  test.beforeEach(async ({ chatPage }) => {
    await login()
    await chatPage.goto()
  })

  test('shows empty state for new chat', async ({ chatPage }) => {
    await expect(chatPage.getEmptyState()).toBeVisible()
    await expect(chatPage.getInput()).toBeVisible()
    await expect(chatPage.getSendButton()).toBeVisible()
  })

  test('isPublic toggle is visible and defaults to off', async ({ chatPage }) => {
    const toggle = chatPage.getPublicToggle()
    await expect(toggle).toBeVisible()
    await expect(toggle).not.toBeChecked()
  })

  test('can toggle isPublic on and off', async ({ chatPage }) => {
    const toggle = chatPage.getPublicToggle()
    await expect(toggle).not.toBeChecked()
    await chatPage.togglePublic()
    await expect(toggle).toBeChecked()
    await chatPage.togglePublic()
    await expect(toggle).not.toBeChecked()
  })

  test('can type in the input field', async ({ chatPage }) => {
    const input = chatPage.getInput()
    await input.fill('Hello world')
    await expect(input).toHaveValue('Hello world')
  })

  test('creating a chat navigates to chat page', async ({ chatPage, page }) => {
    await chatPage.sendUserMessage('Tell me a joke')
    await expect(page).toHaveURL(CHAT_URL_PATTERN)
  })

  test('handles empty message submission gracefully', async ({ chatPage, page }) => {
    await chatPage.getSendButton().click()
    await expect(page).toHaveURL('/')
    await expect(chatPage.getInput()).toBeVisible()
  })
})

test.describe('Chat Conversation', () => {
  test.beforeEach(async ({ chatPage }) => {
    await login()
    await chatPage.goto()
  })

  test('sends message and receives response', async ({ chatPage, page }) => {
    await chatPage.sendUserMessage('Tell me a joke')
    await expect(page).toHaveURL(CHAT_URL_PATTERN)
    await chatPage.waitForResponse()

    const messages = chatPage.getMessages()
    await expect(messages).toHaveCount(2, { timeout: 15_000 })
    await expect(messages.last()).toHaveAttribute('class', /is-assistant/u)
  })

  test('input clears after sending', async ({ chatPage }) => {
    const input = chatPage.getInput()
    await input.fill('Test message')
    await chatPage.sendMessage()
    await expect(input).toHaveValue('')
  })

  test('input is re-enabled after response completes', async ({ chatPage }) => {
    await chatPage.sendUserMessage('Hello!')
    await chatPage.waitForResponse()
    await expect(chatPage.getInput()).not.toBeDisabled()
    await expect(chatPage.getSendButton()).toBeVisible()
  })

  test('can send multiple messages in a conversation', async ({ chatPage }) => {
    await chatPage.sendUserMessage('Tell me a joke')
    await chatPage.waitForResponse()

    const messagesAfterFirst = chatPage.getMessages()
    await expect(messagesAfterFirst).toHaveCount(2, { timeout: 15_000 })

    await chatPage.typeMessage('Tell me another joke')
    await chatPage.sendMessage()
    await chatPage.waitForResponse()

    const messagesAfterSecond = chatPage.getMessages()
    await expect(messagesAfterSecond).toHaveCount(4, { timeout: 15_000 })
  })

  test('messages persist in order', async ({ chatPage }) => {
    await chatPage.sendUserMessage('First message')
    await chatPage.waitForResponse()

    await chatPage.typeMessage('Second message')
    await chatPage.sendMessage()
    await chatPage.waitForResponse()

    const messages = chatPage.getMessages()
    await expect(messages).toHaveCount(4, { timeout: 15_000 })
    await expect(messages.nth(0)).toContainText('First message')
    await expect(messages.nth(2)).toContainText('Second message')
  })
})

test.describe('Chat Persistence', () => {
  test.beforeEach(async ({ chatPage }) => {
    await login()
    await chatPage.goto()
  })

  test('can return to existing chat via URL', async ({ chatPage, page }) => {
    test.setTimeout(60_000)
    await chatPage.sendUserMessage('Remember this message')
    await chatPage.waitForResponse()

    const chatUrl = chatPage.getCurrentUrl()
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('[data-testid="message"]').first().waitFor({ state: 'attached', timeout: 20_000 })

    const messageText = await page.locator('[data-testid="message"]').first().textContent()
    expect(messageText).toContain('Remember this message')
    await expect(page).toHaveURL(chatUrl)
  })

  test('chat appears in sidebar after creation', async ({ chatPage }) => {
    await chatPage.sendUserMessage('New chat message')
    await chatPage.waitForResponse()

    const threadItems = chatPage.getThreadItems()
    await expect(threadItems.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe
  .serial('Chat Sidebar', () => {
    test.beforeEach(async ({ chatPage }) => {
      await login()
      await chatPage.goto()
    })

    test('shows thread list with existing chats', async ({ chatPage, page }) => {
      const uniqueMessage = `Create thread ${Date.now()}`

      await chatPage.sendUserMessage(uniqueMessage)
      await chatPage.waitForResponse()

      const threadList = chatPage.getThreadList()
      await expect(threadList).toBeVisible()

      const newThread = page.locator('[data-testid="thread-item"]', { hasText: uniqueMessage })
      await expect(newThread).toBeVisible({ timeout: 10_000 })
    })

    test('new chat button navigates to /', async ({ chatPage, page }) => {
      await chatPage.sendUserMessage('First chat')
      await chatPage.waitForResponse()

      await expect(page).toHaveURL(CHAT_URL_PATTERN)

      const newChatButton = chatPage.getNewChatButton()
      await newChatButton.click()

      await expect(page).toHaveURL('/')
    })

    test('can navigate between chats', async ({ chatPage, page }) => {
      test.setTimeout(90_000)
      const firstMessage = `First chat ${Date.now()}`
      await chatPage.sendUserMessage(firstMessage)
      await chatPage.waitForResponse()
      const firstUrl = chatPage.getCurrentUrl()

      await chatPage.createNewChat()
      const secondMessage = `Second chat ${Date.now()}`
      await chatPage.sendUserMessage(secondMessage)
      await chatPage.waitForResponse()

      const firstThread = page.locator('[data-testid="thread-item"]', { hasText: firstMessage })
      await firstThread.click()
      await expect(page).toHaveURL(firstUrl, { timeout: 10_000 })
    })

    test('can delete a thread', async ({ chatPage, page }) => {
      const uniqueMessage = `Thread to delete ${Date.now()}`

      await chatPage.sendUserMessage(uniqueMessage)
      await chatPage.waitForResponse()

      const newThread = page.locator('[data-testid="thread-item"]', { hasText: uniqueMessage })
      await expect(newThread).toBeVisible({ timeout: 10_000 })

      const deleteButton = newThread.locator('[data-testid="delete-thread-button"]')
      await deleteButton.click()

      await expect(newThread).not.toBeVisible({ timeout: 10_000 })
    })

    test('public chats button navigates to /public', async ({ chatPage, page }) => {
      const publicChatsButton = chatPage.getPublicChatsButton()
      await publicChatsButton.click()
      await expect(page).toHaveURL('/public')
    })
  })

test.describe('Chat Tool Approval', () => {
  test.beforeEach(async ({ chatPage }) => {
    await login()
    await chatPage.goto()
  })

  test('shows approval card when weather tool is called', async ({ chatPage }) => {
    await chatPage.sendUserMessage("What's the weather in London?")
    await expect(chatPage.getToolApprovalCard()).toBeVisible({ timeout: 15_000 })
    await expect(chatPage.getApproveButton()).toBeVisible()
    await expect(chatPage.getDenyButton()).toBeVisible()
  })

  test('approving tool call shows weather result', async ({ chatPage, page }) => {
    await chatPage.sendUserMessage("What's the weather in Paris?")
    await expect(chatPage.getToolApprovalCard()).toBeVisible({ timeout: 15_000 })

    await chatPage.approveToolCall()
    await expect(page.getByText(/temperature|weather|celsius|°/iu).first()).toBeVisible({ timeout: 30_000 })
    await chatPage.waitForResponse()
  })
})

test.describe('Chat Thinking Indicator', () => {
  test.beforeEach(async ({ chatPage }) => {
    await login()
    await chatPage.goto()
    await chatPage.sendUserMessage('Hello')
    await chatPage.waitForResponse()
  })

  test('shows thinking indicator during streaming', async ({ chatPage, page }) => {
    await chatPage.typeMessage('Tell me a story')
    await chatPage.sendMessage()
    const thinkingIndicator = page.getByTestId('thinking-indicator')
    await expect(thinkingIndicator).toBeAttached({ timeout: 2000 })
  })
})
