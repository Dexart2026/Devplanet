# 🪐 DevPlanet

Seu perfil GitHub como um planeta — com autenticação OAuth real e banco de dados.

## Estrutura

```
devplanet/
├── server.js          # Backend Express + Passport OAuth
├── .env.example       # Template de variáveis de ambiente
├── data/              # Banco de dados NeDB (criado automaticamente)
│   ├── users.db       # Perfis dos usuários
│   ├── sessions.db    # Sessões
│   └── activity.db    # Log de logins
└── public/
    ├── index.html     # Página de login
    └── dashboard.html # Dashboard do usuário
```

## Setup rápido

### 1. Instale as dependências
```bash
npm install
```

### 2. Crie o GitHub OAuth App
Acesse https://github.com/settings/developers → **New OAuth App**

| Campo | Valor |
|-------|-------|
| Application name | DevPlanet |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/auth/github/callback` |

Copie o **Client ID** e gere um **Client Secret**.

### 3. Configure o .env
```bash
cp .env.example .env
# Edite .env com seu Client ID e Secret
```

### 4. Inicie o servidor
```bash
node server.js
```

Acesse **http://localhost:3000** 🚀

## Banco de dados (NeDB)

O NeDB é um banco embedded sem configuração — os dados ficam em arquivos `.db` na pasta `data/`. Cada registro de usuário armazena:

- Dados do perfil GitHub (nome, avatar, bio, localização)
- Estatísticas (repos, estrelas, forks, seguidores)
- Mapa de linguagens usadas
- XP Score calculado
- Histórico de logins

## API endpoints

| Rota | Descrição |
|------|-----------|
| `GET /auth/github` | Inicia o OAuth com o GitHub |
| `GET /auth/github/callback` | Callback pós-autenticação |
| `GET /auth/logout` | Encerra a sessão |
| `GET /api/me` | Dados do usuário logado |
| `GET /api/leaderboard` | Top 20 usuários por score |

## Sistema de níveis

| Nível | Nome | Score |
|-------|------|-------|
| 1 | 🪨 Asteroide | 0+ |
| 2 | 🌑 Proto-planeta | 30+ |
| 3 | 🌍 Planeta Terrestre | 100+ |
| 4 | 🌿 Mundo Verde | 300+ |
| 5 | 🌊 Planeta Oceânico | 700+ |
| 6 | 🌟 Gigante Gasoso | 1.500+ |
| 7 | 🧊 Gigante de Gelo | 3.000+ |
| 8 | 🌌 Planeta Nebulosa | 6.000+ |
| 9 | ☀️ Estrela Dev | 12.000+ |

## Para produção

- Troque `SESSION_SECRET` por uma string aleatória forte
- Atualize `GITHUB_CALLBACK_URL` para seu domínio real
- Configure HTTPS
- Considere migrar o NeDB para MongoDB ou PostgreSQL para escala maior
