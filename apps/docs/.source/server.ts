// @ts-nocheck
import * as __fd_glob_18 from "../content/docs/troubleshooting.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/testing.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/security.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/schema-evolution.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/recipes.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/quickstart.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/organizations.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/native-apps.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/migration.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/forms.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/ejecting.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/deployment.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/data-fetching.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/custom-queries.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/components.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/cli.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/api-reference.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"api-reference.mdx": __fd_glob_1, "cli.mdx": __fd_glob_2, "components.mdx": __fd_glob_3, "custom-queries.mdx": __fd_glob_4, "data-fetching.mdx": __fd_glob_5, "deployment.mdx": __fd_glob_6, "ejecting.mdx": __fd_glob_7, "forms.mdx": __fd_glob_8, "index.mdx": __fd_glob_9, "migration.mdx": __fd_glob_10, "native-apps.mdx": __fd_glob_11, "organizations.mdx": __fd_glob_12, "quickstart.mdx": __fd_glob_13, "recipes.mdx": __fd_glob_14, "schema-evolution.mdx": __fd_glob_15, "security.mdx": __fd_glob_16, "testing.mdx": __fd_glob_17, "troubleshooting.mdx": __fd_glob_18, });