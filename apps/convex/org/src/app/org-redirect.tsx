const OrgRedirect = ({ orgId, slug, to }: { orgId: string; slug: string; to: string }) => (
  <script
    // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled redirect pattern
    dangerouslySetInnerHTML={{
      __html: `window.location.href="/api/set-org?orgId=${encodeURIComponent(orgId)}&slug=${encodeURIComponent(slug)}&to=${encodeURIComponent(to)}"`
    }} // oxlint-disable-line react/no-danger, react-perf/jsx-no-new-object-as-prop
  />
)

export default OrgRedirect
