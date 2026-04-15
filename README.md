# PlainList

PlainList 已重构为前后端分离的单仓库 TypeScript 项目。

## Monorepo Structure

```text
PlainList/
├─ apps/
│  ├─ web/        # Vue 3 + Vite + TypeScript
│  └─ api/        # Express + MySQL + TypeScript
├─ packages/
│  ├─ shared/     # shared types / constants / schemas / date helpers
│  ├─ db/         # migrations / seeds / schema snapshot
│  └─ config/     # shared tsconfig / eslint config
└─ docs/
```

## Scripts

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Useful workspace commands:

```bash
npm run dev:web
npm run dev:api
npm run lint
npm run test
npm run build
```

## Notes

- The backend no longer hosts the frontend bundle directly.
- The legacy root static frontend is being removed in favor of `apps/web`.
- The plugin system is being narrowed from arbitrary JS execution toward manifest + config driven behavior.
- Database bootstrap is managed through explicit migrations and seeds in `packages/db`.

## AI Review

- The Day section now includes an AI critique panel that can generate daily, weekly, monthly, and yearly reviews from plan + check data.
- The backend calls an OpenAI-compatible chat completion endpoint through `apps/api/.env`.
- Copy `apps/api/.env.example` if you need to change provider, model, or timeout.
