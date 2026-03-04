# ♟ Chess Roguelike — Шахматное Подземелье

2D пошаговый рогалик, где все существа — шахматные фигуры.
Онлайн-мультиплеер на Cloudflare Workers.

## Запуск

### 1. Установка зависимостей
```bash
npm install
```

### 2. Сборка shared-пакета
```bash
npm run build:shared
```

### 3. Запуск сервера (локально)
```bash
npm run dev:server
```

### 4. Запуск клиента
```bash
npm run dev:client
```

Откройте http://localhost:3000 в браузере.

## Управление

| Клавиша | Действие |
|---------|----------|
| WASD / Стрелки | Движение |
| E | Подобрать предмет |
| F | Спуститься по лестнице |
| Space | Пропустить ход |
| I | Инвентарь |
| Enter | Чат |
| Клик по клетке | Переместиться |

## Архитектура

- **Client**: Vite + TypeScript + Canvas 2D
- **Server**: Cloudflare Workers + Durable Objects (WebSocket Hibernation)
- **Shared**: Общие типы, протокол, шахматные правила
