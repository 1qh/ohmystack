/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  completed: __t.option(__t.bool()),
  priority: __t.option(__t.string()),
  projectId: __t.f64().name("project_id"),
  title: __t.string(),
  assigneeId: __t.option(__t.identity()).name("assignee_id"),
  createdAt: __t.timestamp().name("created_at"),
  id: __t.u32().primaryKey(),
  orgId: __t.u32().name("org_id"),
  updatedAt: __t.timestamp().name("updated_at"),
  userId: __t.identity().name("user_id"),
});
