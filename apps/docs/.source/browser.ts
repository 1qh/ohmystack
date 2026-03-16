// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';

import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>(),
 browserCollections = {
  docs: create.doc("docs", {"api-reference.mdx": async () => import("../content/docs/api-reference.mdx?collection=docs"), "cli.mdx": async () => import("../content/docs/cli.mdx?collection=docs"), "components.mdx": async () => import("../content/docs/components.mdx?collection=docs"), "custom-queries.mdx": async () => import("../content/docs/custom-queries.mdx?collection=docs"), "data-fetching.mdx": async () => import("../content/docs/data-fetching.mdx?collection=docs"), "deployment.mdx": async () => import("../content/docs/deployment.mdx?collection=docs"), "ejecting.mdx": async () => import("../content/docs/ejecting.mdx?collection=docs"), "forms.mdx": async () => import("../content/docs/forms.mdx?collection=docs"), "index.mdx": async () => import("../content/docs/index.mdx?collection=docs"), "migration.mdx": async () => import("../content/docs/migration.mdx?collection=docs"), "native-apps.mdx": async () => import("../content/docs/native-apps.mdx?collection=docs"), "organizations.mdx": async () => import("../content/docs/organizations.mdx?collection=docs"), "quickstart.mdx": async () => import("../content/docs/quickstart.mdx?collection=docs"), "recipes.mdx": async () => import("../content/docs/recipes.mdx?collection=docs"), "schema-evolution.mdx": async () => import("../content/docs/schema-evolution.mdx?collection=docs"), "security.mdx": async () => import("../content/docs/security.mdx?collection=docs"), "testing.mdx": async () => import("../content/docs/testing.mdx?collection=docs"), "troubleshooting.mdx": async () => import("../content/docs/troubleshooting.mdx?collection=docs"), }),
};
export default browserCollections;