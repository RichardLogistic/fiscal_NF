export function getRequestUser(request: Request): { email: string; name: string } {
  const email =
    request.headers.get("oai-authenticated-user-email") ??
    "usuario-preview@carmak.local";
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding",
  );

  let name = email.split("@")[0] || "Usuário Carmak";
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      name = email.split("@")[0] || "Usuário Carmak";
    }
  }

  return { email, name };
}
