const OrgRedirect = ({ orgId, slug, to }: { orgId: string; slug: string; to: string }) => (
  <script>{`window.location.href="/api/set-org?orgId=${encodeURIComponent(orgId)}&slug=${encodeURIComponent(slug)}&to=${encodeURIComponent(to)}"`}</script>
)
export default OrgRedirect
