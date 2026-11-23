// Single place that decides where each backend lives.
// Override in frontend/.env (see frontend/.env.example); defaults match the local dev setup.
const trim = (url) => String(url).replace(/\/+$/, '')

// FastAPI (AI, RAG, mastery, uploads)  - port 8000
export const FASTAPI_URL = trim(import.meta.env.VITE_FASTAPI_URL || 'http://localhost:8000')
export const FASTAPI_API_URL = trim(import.meta.env.VITE_FASTAPI_API_URL || `${FASTAPI_URL}/api/v1`)
// Node/Express (payments, guardian data) - port 5000
export const NODE_API_URL = trim(import.meta.env.VITE_NODE_API_URL || 'http://localhost:5000')
