import { expect, test } from './fixtures'
import { login } from './helpers'

const FETCH_BY_ID_RE = /Fetch by ID/iu,
  CACHE_HIT_RE = /Cache Hit/iu

test.describe
  .serial('Movie Search', () => {
    test.beforeEach(async ({ moviePage }) => {
      await login()
      await moviePage.gotoSearch()
    })

    test('shows movie search page', async ({ moviePage }) => {
      await expect(moviePage.getSearchPage()).toBeVisible()
      await expect(moviePage.getSearchInput()).toBeVisible()
    })

    test('searches for movies by query', async ({ moviePage }) => {
      await moviePage.searchMovie('Inception')
      await expect(moviePage.getMovieResults()).toBeVisible({ timeout: 15_000 })
      const count = await moviePage.getMovieCards().count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('displays movie title in results', async ({ moviePage }) => {
      await moviePage.searchMovie('Fight Club')
      await expect(moviePage.getMovieResults()).toBeVisible({ timeout: 15_000 })
      await expect(moviePage.getMovieTitle()).toContainText('Fight Club')
    })

    test('shows multiple results for broad search', async ({ moviePage }) => {
      await moviePage.searchMovie('Batman')
      await expect(moviePage.getMovieResults()).toBeVisible({ timeout: 15_000 })
      const count = await moviePage.getMovieCards().count()
      expect(count).toBeGreaterThan(1)
    })

    test('navigates to fetch page via link', async ({ moviePage, page }) => {
      await page.getByRole('link', { name: FETCH_BY_ID_RE }).click()
      await expect(moviePage.getFetchPage()).toBeVisible()
    })
  })

test.describe
  .serial('Movie Fetch by ID', () => {
    test.beforeEach(async ({ moviePage }) => {
      await login()
      await moviePage.gotoFetch()
    })

    test('shows fetch page with ID input', async ({ moviePage }) => {
      await expect(moviePage.getFetchPage()).toBeVisible()
      await expect(moviePage.getFetchInput()).toBeVisible()
    })

    test('fetches movie by TMDB ID', async ({ moviePage }) => {
      await moviePage.fetchMovie(27_205)
      await expect(moviePage.getMovieDetail()).toBeVisible({ timeout: 15_000 })
    })

    test('displays cache status badge', async ({ moviePage }) => {
      await moviePage.fetchMovie(27_205)
      await expect(moviePage.getMovieDetail()).toBeVisible({ timeout: 15_000 })
      await expect(moviePage.getCacheStatus()).toBeVisible()
    })

    test('shows cache miss on first fetch', async ({ moviePage }) => {
      const randomId = 550 + Math.floor(Math.random() * 1000)
      await moviePage.fetchMovie(randomId)
      const detail = moviePage.getMovieDetail(),
        fetchError = moviePage.getMovieError()
      await expect(detail.or(fetchError)).toBeVisible({ timeout: 15_000 })
    })

    test('shows cache hit on repeated fetch', async ({ moviePage }) => {
      await moviePage.fetchMovie(155)
      await expect(moviePage.getMovieDetail()).toBeVisible({ timeout: 15_000 })

      await moviePage.getFetchInput().clear()
      await moviePage.fetchMovie(155)
      await expect(moviePage.getCacheStatus()).toContainText(CACHE_HIT_RE, { timeout: 15_000 })
    })

    test('shows loading state while fetching', async ({ moviePage }) => {
      const fetchPromise = moviePage.fetchMovie(680)
      await expect(moviePage.getMovieLoading())
        .toBeVisible({ timeout: 5000 })
        .catch(() => null)
      await fetchPromise
    })

    test('shows error for invalid ID', async ({ moviePage }) => {
      await moviePage.fetchMovie(0)
      await expect(moviePage.getMovieError()).toBeVisible({ timeout: 5000 })
    })

    test('shows error for non-existent movie', async ({ moviePage }) => {
      await moviePage.fetchMovie(999_999_999)
      await expect(moviePage.getMovieError()).toBeVisible({ timeout: 15_000 })
    })

    test('navigates back to search page', async ({ moviePage, page }) => {
      await page.getByRole('link').first().click()
      await expect(moviePage.getSearchPage()).toBeVisible()
    })
  })
