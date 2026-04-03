/* eslint-disable */
import {
  DbConnectionBuilder as __DbConnectionBuilder,
  DbConnectionImpl as __DbConnectionImpl,
  SubscriptionBuilderImpl as __SubscriptionBuilderImpl,
  TypeBuilder as __TypeBuilder,
  Uuid as __Uuid,
  convertToAccessorMap as __convertToAccessorMap,
  makeQueryBuilder as __makeQueryBuilder,
  procedureSchema as __procedureSchema,
  procedures as __procedures,
  reducerSchema as __reducerSchema,
  reducers as __reducers,
  schema as __schema,
  t as __t,
  table as __table,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type DbConnectionConfig as __DbConnectionConfig,
  type ErrorContextInterface as __ErrorContextInterface,
  type Event as __Event,
  type EventContextInterface as __EventContextInterface,
  type Infer as __Infer,
  type QueryBuilder as __QueryBuilder,
  type ReducerEventContextInterface as __ReducerEventContextInterface,
  type RemoteModule as __RemoteModule,
  type SubscriptionEventContextInterface as __SubscriptionEventContextInterface,
  type SubscriptionHandleImpl as __SubscriptionHandleImpl,
} from "spacetimedb";
import CreateBlogReducer from "./create_blog_reducer";
import RmBlogReducer from "./rm_blog_reducer";
import UpdateBlogReducer from "./update_blog_reducer";
import CreateChatReducer from "./create_chat_reducer";
import RmChatReducer from "./rm_chat_reducer";
import UpdateChatReducer from "./update_chat_reducer";
import CreateProjectReducer from "./create_project_reducer";
import RmProjectReducer from "./rm_project_reducer";
import UpdateProjectReducer from "./update_project_reducer";
import CreateTaskReducer from "./create_task_reducer";
import RmTaskReducer from "./rm_task_reducer";
import UpdateTaskReducer from "./update_task_reducer";
import CreateWikiReducer from "./create_wiki_reducer";
import RmWikiReducer from "./rm_wiki_reducer";
import UpdateWikiReducer from "./update_wiki_reducer";
import GetBlogProfileReducer from "./get_blog_profile_reducer";
import UpsertBlogProfileReducer from "./upsert_blog_profile_reducer";
import GetOrgProfileReducer from "./get_org_profile_reducer";
import UpsertOrgProfileReducer from "./upsert_org_profile_reducer";
import CreateMovieReducer from "./create_movie_reducer";
import InvalidateMovieReducer from "./invalidate_movie_reducer";
import PurgeMovieReducer from "./purge_movie_reducer";
import RmMovieReducer from "./rm_movie_reducer";
import UpdateMovieReducer from "./update_movie_reducer";
import CreateMessageReducer from "./create_message_reducer";
import RmMessageReducer from "./rm_message_reducer";
import UpdateMessageReducer from "./update_message_reducer";
import DeleteFileFileReducer from "./delete_file_file_reducer";
import RegisterUploadFileReducer from "./register_upload_file_reducer";
import OrgCreateReducer from "./org_create_reducer";
import OrgRemoveReducer from "./org_remove_reducer";
import OrgUpdateReducer from "./org_update_reducer";
import OrgLeaveReducer from "./org_leave_reducer";
import OrgRemoveMemberReducer from "./org_remove_member_reducer";
import OrgSetAdminReducer from "./org_set_admin_reducer";
import OrgTransferOwnershipReducer from "./org_transfer_ownership_reducer";
import OrgAcceptInviteReducer from "./org_accept_invite_reducer";
import OrgRevokeInviteReducer from "./org_revoke_invite_reducer";
import OrgSendInviteReducer from "./org_send_invite_reducer";
import OrgApproveJoinReducer from "./org_approve_join_reducer";
import OrgCancelJoinReducer from "./org_cancel_join_reducer";
import OrgRejectJoinReducer from "./org_reject_join_reducer";
import OrgRequestJoinReducer from "./org_request_join_reducer";
import BlogRow from "./blog_table";
import BlogProfileRow from "./blog_profile_table";
import ChatRow from "./chat_table";
import FileRow from "./file_table";
import MessageRow from "./message_table";
import MovieRow from "./movie_table";
import OrgRow from "./org_table";
import OrgInviteRow from "./org_invite_table";
import OrgJoinRequestRow from "./org_join_request_table";
import OrgMemberRow from "./org_member_table";
import OrgProfileRow from "./org_profile_table";
import ProjectRow from "./project_table";
import TaskRow from "./task_table";
import WikiRow from "./wiki_table";
/** Type-only namespace exports for generated type groups. */
/** The schema information for all tables in this module. This is defined the same was as the tables would have been defined in the server. */
const tablesSchema = __schema({
  blog: __table({
    name: 'blog',
    indexes: [
      { accessor: 'id', name: 'blog_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'published', name: 'blog_published_idx_btree', algorithm: 'btree', columns: [
        'published',
      ] },
      { accessor: 'userId', name: 'blog_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'blog_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, BlogRow),
  blogProfile: __table({
    name: 'blog_profile',
    indexes: [
      { accessor: 'id', name: 'blog_profile_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'userId', name: 'blog_profile_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'blog_profile_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, BlogProfileRow),
  chat: __table({
    name: 'chat',
    indexes: [
      { accessor: 'id', name: 'chat_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'isPublic', name: 'chat_is_public_idx_btree', algorithm: 'btree', columns: [
        'isPublic',
      ] },
      { accessor: 'userId', name: 'chat_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'chat_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, ChatRow),
  file: __table({
    name: 'file',
    indexes: [
      { accessor: 'id', name: 'file_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'userId', name: 'file_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'file_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, FileRow),
  message: __table({
    name: 'message',
    indexes: [
      { accessor: 'chatId', name: 'message_chat_id_idx_btree', algorithm: 'btree', columns: [
        'chatId',
      ] },
      { accessor: 'id', name: 'message_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'userId', name: 'message_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'message_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, MessageRow),
  movie: __table({
    name: 'movie',
    indexes: [
      { accessor: 'id', name: 'movie_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'tmdbId', name: 'movie_tmdb_id_idx_btree', algorithm: 'btree', columns: [
        'tmdbId',
      ] },
    ],
    constraints: [
      { name: 'movie_id_key', constraint: 'unique', columns: ['id'] },
      { name: 'movie_tmdb_id_key', constraint: 'unique', columns: ['tmdbId'] },
    ],
  }, MovieRow),
  org: __table({
    name: 'org',
    indexes: [
      { accessor: 'id', name: 'org_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'slug', name: 'org_slug_idx_btree', algorithm: 'btree', columns: [
        'slug',
      ] },
      { accessor: 'userId', name: 'org_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'org_id_key', constraint: 'unique', columns: ['id'] },
      { name: 'org_slug_key', constraint: 'unique', columns: ['slug'] },
    ],
  }, OrgRow),
  orgInvite: __table({
    name: 'org_invite',
    indexes: [
      { accessor: 'id', name: 'org_invite_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'orgId', name: 'org_invite_org_id_idx_btree', algorithm: 'btree', columns: [
        'orgId',
      ] },
      { accessor: 'token', name: 'org_invite_token_idx_btree', algorithm: 'btree', columns: [
        'token',
      ] },
    ],
    constraints: [
      { name: 'org_invite_id_key', constraint: 'unique', columns: ['id'] },
      { name: 'org_invite_token_key', constraint: 'unique', columns: ['token'] },
    ],
  }, OrgInviteRow),
  orgJoinRequest: __table({
    name: 'org_join_request',
    indexes: [
      { accessor: 'id', name: 'org_join_request_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'orgId', name: 'org_join_request_org_id_idx_btree', algorithm: 'btree', columns: [
        'orgId',
      ] },
      { accessor: 'status', name: 'org_join_request_status_idx_btree', algorithm: 'btree', columns: [
        'status',
      ] },
      { accessor: 'userId', name: 'org_join_request_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'org_join_request_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, OrgJoinRequestRow),
  orgMember: __table({
    name: 'org_member',
    indexes: [
      { accessor: 'id', name: 'org_member_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'orgId', name: 'org_member_org_id_idx_btree', algorithm: 'btree', columns: [
        'orgId',
      ] },
      { accessor: 'userId', name: 'org_member_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'org_member_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, OrgMemberRow),
  orgProfile: __table({
    name: 'org_profile',
    indexes: [
      { accessor: 'id', name: 'org_profile_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'userId', name: 'org_profile_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'org_profile_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, OrgProfileRow),
  project: __table({
    name: 'project',
    indexes: [
      { accessor: 'id', name: 'project_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'orgId', name: 'project_org_id_idx_btree', algorithm: 'btree', columns: [
        'orgId',
      ] },
      { accessor: 'userId', name: 'project_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'project_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, ProjectRow),
  task: __table({
    name: 'task',
    indexes: [
      { accessor: 'id', name: 'task_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'orgId', name: 'task_org_id_idx_btree', algorithm: 'btree', columns: [
        'orgId',
      ] },
      { accessor: 'userId', name: 'task_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'task_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, TaskRow),
  wiki: __table({
    name: 'wiki',
    indexes: [
      { accessor: 'id', name: 'wiki_id_idx_btree', algorithm: 'btree', columns: [
        'id',
      ] },
      { accessor: 'orgId', name: 'wiki_org_id_idx_btree', algorithm: 'btree', columns: [
        'orgId',
      ] },
      { accessor: 'orgIdSlug', name: 'wiki_org_id_slug_idx_btree', algorithm: 'btree', columns: [
        'orgId',
        'slug',
      ] },
      { accessor: 'userId', name: 'wiki_user_id_idx_btree', algorithm: 'btree', columns: [
        'userId',
      ] },
    ],
    constraints: [
      { name: 'wiki_id_key', constraint: 'unique', columns: ['id'] },
    ],
  }, WikiRow),
});
/** The schema information for all reducers in this module. This is defined the same way as the reducers would have been defined in the server, except the body of the reducer is omitted in code generation. */
const reducersSchema = __reducers(
  __reducerSchema("create_blog", CreateBlogReducer),
  __reducerSchema("rm_blog", RmBlogReducer),
  __reducerSchema("update_blog", UpdateBlogReducer),
  __reducerSchema("create_chat", CreateChatReducer),
  __reducerSchema("rm_chat", RmChatReducer),
  __reducerSchema("update_chat", UpdateChatReducer),
  __reducerSchema("create_project", CreateProjectReducer),
  __reducerSchema("rm_project", RmProjectReducer),
  __reducerSchema("update_project", UpdateProjectReducer),
  __reducerSchema("create_task", CreateTaskReducer),
  __reducerSchema("rm_task", RmTaskReducer),
  __reducerSchema("update_task", UpdateTaskReducer),
  __reducerSchema("create_wiki", CreateWikiReducer),
  __reducerSchema("rm_wiki", RmWikiReducer),
  __reducerSchema("update_wiki", UpdateWikiReducer),
  __reducerSchema("get_blogProfile", GetBlogProfileReducer),
  __reducerSchema("upsert_blogProfile", UpsertBlogProfileReducer),
  __reducerSchema("get_orgProfile", GetOrgProfileReducer),
  __reducerSchema("upsert_orgProfile", UpsertOrgProfileReducer),
  __reducerSchema("create_movie", CreateMovieReducer),
  __reducerSchema("invalidate_movie", InvalidateMovieReducer),
  __reducerSchema("purge_movie", PurgeMovieReducer),
  __reducerSchema("rm_movie", RmMovieReducer),
  __reducerSchema("update_movie", UpdateMovieReducer),
  __reducerSchema("create_message", CreateMessageReducer),
  __reducerSchema("rm_message", RmMessageReducer),
  __reducerSchema("update_message", UpdateMessageReducer),
  __reducerSchema("delete_file_file", DeleteFileFileReducer),
  __reducerSchema("register_upload_file", RegisterUploadFileReducer),
  __reducerSchema("org_create", OrgCreateReducer),
  __reducerSchema("org_remove", OrgRemoveReducer),
  __reducerSchema("org_update", OrgUpdateReducer),
  __reducerSchema("org_leave", OrgLeaveReducer),
  __reducerSchema("org_remove_member", OrgRemoveMemberReducer),
  __reducerSchema("org_set_admin", OrgSetAdminReducer),
  __reducerSchema("org_transfer_ownership", OrgTransferOwnershipReducer),
  __reducerSchema("org_accept_invite", OrgAcceptInviteReducer),
  __reducerSchema("org_revoke_invite", OrgRevokeInviteReducer),
  __reducerSchema("org_send_invite", OrgSendInviteReducer),
  __reducerSchema("org_approve_join", OrgApproveJoinReducer),
  __reducerSchema("org_cancel_join", OrgCancelJoinReducer),
  __reducerSchema("org_reject_join", OrgRejectJoinReducer),
  __reducerSchema("org_request_join", OrgRequestJoinReducer),
);
/** The schema information for all procedures in this module. This is defined the same way as the procedures would have been defined in the server. */
const proceduresSchema = __procedures(
);
/** The remote SpacetimeDB module schema, both runtime and type information. */
const REMOTE_MODULE = {
  versionInfo: {
    cliVersion: "2.0.5" as const,
  },
  tables: tablesSchema.schemaType.tables,
  reducers: reducersSchema.reducersType.reducers,
  ...proceduresSchema,
} satisfies __RemoteModule<
  typeof tablesSchema.schemaType,
  typeof reducersSchema.reducersType,
  typeof proceduresSchema
>;
/** The tables available in this remote SpacetimeDB module. Each table reference doubles as a query builder. */
export const tables: __QueryBuilder<typeof tablesSchema.schemaType> = __makeQueryBuilder(tablesSchema.schemaType);
/** The reducers available in this remote SpacetimeDB module. */
export const reducers = __convertToAccessorMap(reducersSchema.reducersType.reducers);
/** The context type returned in callbacks for all possible events. */
export type EventContext = __EventContextInterface<typeof REMOTE_MODULE>;
/** The context type returned in callbacks for reducer events. */
export type ReducerEventContext = __ReducerEventContextInterface<typeof REMOTE_MODULE>;
/** The context type returned in callbacks for subscription events. */
export type SubscriptionEventContext = __SubscriptionEventContextInterface<typeof REMOTE_MODULE>;
/** The context type returned in callbacks for error events. */
export type ErrorContext = __ErrorContextInterface<typeof REMOTE_MODULE>;
/** The subscription handle type to manage active subscriptions created from a {@link SubscriptionBuilder}. */
export type SubscriptionHandle = __SubscriptionHandleImpl<typeof REMOTE_MODULE>;
/** Builder class to configure a new subscription to the remote SpacetimeDB instance. */
export class SubscriptionBuilder extends __SubscriptionBuilderImpl<typeof REMOTE_MODULE> {}
/** Builder class to configure a new database connection to the remote SpacetimeDB instance. */
export class DbConnectionBuilder extends __DbConnectionBuilder<DbConnection> {}
/** The typed database connection to manage connections to the remote SpacetimeDB instance. This class has type information specific to the generated module. */
export class DbConnection extends __DbConnectionImpl<typeof REMOTE_MODULE> {
  /** Creates a new {@link DbConnectionBuilder} to configure and connect to the remote SpacetimeDB instance. */
  static builder = (): DbConnectionBuilder => {
    return new DbConnectionBuilder(REMOTE_MODULE, (config: __DbConnectionConfig<typeof REMOTE_MODULE>) => new DbConnection(config));
  };
  /** Creates a new {@link SubscriptionBuilder} to configure a subscription to the remote SpacetimeDB instance. */
  override subscriptionBuilder = (): SubscriptionBuilder => {
    return new SubscriptionBuilder(this);
  };
}
