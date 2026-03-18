// biome-ignore-all lint/style/useConsistentMemberAccessibility: x
import type { Locator } from '@playwright/test'

import BasePage from '@a/e2e/base-page'

class MoviePage extends BasePage {
  public async fetchMovie(id: number): Promise<void> {
    await this.getFetchInput().fill(String(id))
    await this.getFetchForm().locator('button[type="submit"], input').first().press('Enter')
  }
  public getCacheStatus(): Locator {
    return this.$('cache-status')
  }
  public getFetchForm(): Locator {
    return this.$('movie-fetch-form')
  }
  public getFetchInput(): Locator {
    return this.$('movie-id-input')
  }
  public getFetchPage(): Locator {
    return this.$('movie-fetch-page')
  }
  public getMovieCards(): Locator {
    return this.$$('movie-card')
  }
  public getMovieDetail(): Locator {
    return this.$('movie-detail')
  }
  public getMovieError(): Locator {
    return this.$('movie-error')
  }
  public getMovieLoading(): Locator {
    return this.$('movie-loading')
  }
  public getMovieResults(): Locator {
    return this.$('movie-results')
  }
  public getMovieTitle(): Locator {
    return this.$('movie-title').first()
  }
  public getSearchForm(): Locator {
    return this.$('movie-search-form')
  }
  public getSearchInput(): Locator {
    return this.$('movie-search-input')
  }

  public getSearchPage(): Locator {
    return this.$('movie-search-page')
  }

  public async gotoFetch(): Promise<void> {
    await this.page.goto('/fetch')
    await this.page.waitForLoadState('domcontentloaded')
  }

  public async gotoSearch(): Promise<void> {
    await this.page.goto('/')
    await this.page.waitForLoadState('domcontentloaded')
  }

  public async searchMovie(query: string): Promise<void> {
    await this.getSearchInput().fill(query)
    await this.getSearchForm().locator('button[type="submit"], input').first().press('Enter')
  }
}

export default MoviePage
