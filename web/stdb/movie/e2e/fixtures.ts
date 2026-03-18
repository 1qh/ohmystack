import { test as baseTest } from '@a/e2e/base-test'

import MoviePage from './pages/movie'

interface Fixtures {
  moviePage: MoviePage
}

const test = baseTest.extend<Fixtures>({
  moviePage: async ({ page }, run) => {
    const moviePage = new MoviePage(page)
    await run(moviePage)
  }
})

export { test }
export { expect } from '@a/e2e/base-test'
