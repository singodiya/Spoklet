export async function api<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await response.json().catch(() => ({ error: 'The server could not finish that request. Please try again.' }));
  if (!response.ok) throw new Error(data.error || 'Please try again in a moment.');
  return data as T;
}
