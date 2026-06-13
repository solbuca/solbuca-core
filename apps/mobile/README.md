# apps/mobile

React Native приложение (iOS + Android). Скаффолдить из **Solana Mobile App Kit**
(а не вручную — их шаблон актуален и даёт кошельки/подпись из коробки).

## Скаффолд
Возьми актуальный шаблон Solana App Kit и положи сюда. Включи модули:
- **wallet** — Privy (embedded wallet + social login: Apple/Google), MWA как fallback
- map (react-native-maps / Mapbox)
- payments (Solana Pay)

## Экраны MVP (см. docs/project-notes.md и схемы навигации)
Onboarding: Welcome -> Вход (Apple/Google, тихий кошелёк) -> Разрешения (контекстно) -> Home

Нижние табы:
- Home     — профиль бара, коктейль дня, карта заведений
- Pay      — скан QR -> сумма -> биометрия -> успех (+баллы)   [сердце MVP]
- Rewards  — баланс баллов, перки, погашение (QR бармену)
- Profile  — NFT-членство бара, доступ к кошельку (advanced), настройки

## Принцип
Прятать всю крипту: ни seed-фраз, ни gas, ни "SOL". Оплата в USDC, не в SOL.
Крипто-детали — только в advanced-разделе Profile.

## Зависит от
- `@cocktail/sdk` — клиенты программ
- `@cocktail/config` — кластер, program IDs, USDC mint
