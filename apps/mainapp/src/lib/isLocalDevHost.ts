// Dev-only: true when running on the local Vite dev server (localhost/127.0.0.1), used to skip
// the canonical-subdomain redirect so a locally running dev server can be used to test an
// onboarded account's real session without being bounced to that business's deployed subdomain
// (which never reflects local, unbuilt changes). Never true for anything users actually visit in
// production. Shared by every place that redirects to `user.businessUrl` — App.tsx's own
// canonical-host effect, plus the same redirect after login/onboarding.
export const isLocalDevHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
