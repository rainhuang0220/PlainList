import { useAuthStore } from '@/features/auth/model/useAuthStore';
export function useApi() {
    async function request(method, path, body) {
        const auth = useAuthStore();
        const headers = {
            'Content-Type': 'application/json',
        };
        if (auth.token) {
            headers.Authorization = `Bearer ${auth.token}`;
        }
        const response = await fetch(`/api${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || response.statusText);
        }
        if (response.status === 204) {
            return undefined;
        }
        return response.json();
    }
    return {
        get: (path) => request('GET', path),
        post: (path, body) => request('POST', path, body),
        put: (path, body) => request('PUT', path, body),
        del: (path) => request('DELETE', path),
    };
}
