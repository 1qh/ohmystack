/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  contentType: __t.string().name("content_type"),
  createdAt: __t.timestamp().name("created_at"),
  data: __t.byteArray(),
  filename: __t.string(),
  id: __t.u32().primaryKey(),
  size: __t.f64(),
  uploadedAt: __t.timestamp().name("uploaded_at"),
  userId: __t.identity().name("user_id"),
});
