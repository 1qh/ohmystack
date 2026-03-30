// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';
const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"api-reference.mdx": () => import("../content/docs/api-reference.mdx?collection=docs"), "architecture.mdx": () => import("../content/docs/architecture.mdx?collection=docs"), "cli.mdx": () => import("../content/docs/cli.mdx?collection=docs"), "components.mdx": () => import("../content/docs/components.mdx?collection=docs"), "custom-queries.mdx": () => import("../content/docs/custom-queries.mdx?collection=docs"), "data-fetching.mdx": () => import("../content/docs/data-fetching.mdx?collection=docs"), "deployment.mdx": () => import("../content/docs/deployment.mdx?collection=docs"), "ejecting.mdx": () => import("../content/docs/ejecting.mdx?collection=docs"), "forms.mdx": () => import("../content/docs/forms.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "migration.mdx": () => import("../content/docs/migration.mdx?collection=docs"), "organizations.mdx": () => import("../content/docs/organizations.mdx?collection=docs"), "quickstart.mdx": () => import("../content/docs/quickstart.mdx?collection=docs"), "recipes.mdx": () => import("../content/docs/recipes.mdx?collection=docs"), "schema-evolution.mdx": () => import("../content/docs/schema-evolution.mdx?collection=docs"), "security.mdx": () => import("../content/docs/security.mdx?collection=docs"), "testing.mdx": () => import("../content/docs/testing.mdx?collection=docs"), "troubleshooting.mdx": () => import("../content/docs/troubleshooting.mdx?collection=docs"), }),
};
export default browserCollections;