// Russian for the site's own text. English stays the source: this swaps whole text nodes and a few
// attributes for their Russian, as the page renders (app.js and game.js keep drawing in English).
// The language comes from ?lang=ru (shareable), else the last choice on this browser. Project data
// (names, summaries, notes) comes from the directory and stays as written.
(() => {
  const KEY = 'coop-lang';
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang');
  if (!lang) { try { lang = localStorage.getItem(KEY); } catch { /* storage unavailable */ } }
  lang = lang === 'ru' ? 'ru' : 'en';
  window.COOP_LANG = lang;

  // ── The toggle, next to the theme switch ──────────────────
  function addToggle() {
    const bar = document.querySelector('.masthead__actions');
    if (!bar || bar.querySelector('.lang-btn')) return;
    const b = document.createElement('a');
    b.className = 'icon-btn lang-btn';
    b.textContent = lang === 'ru' ? 'EN' : 'RU';
    b.title = lang === 'ru' ? 'Switch to English' : 'Русская версия';
    const url = new URL(location.href);
    url.searchParams.set('lang', lang === 'ru' ? 'en' : 'ru');
    b.href = url.pathname + url.search + url.hash;
    b.addEventListener('click', () => { try { localStorage.setItem(KEY, lang === 'ru' ? 'en' : 'ru'); } catch { /* ignore */ } });
    bar.insertBefore(b, bar.querySelector('#theme-toggle'));
  }
  if (params.get('lang')) { try { localStorage.setItem(KEY, lang); } catch { /* ignore */ } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addToggle); else addToggle();
  if (lang !== 'ru') return;
  document.documentElement.lang = 'ru';

  // Keep ?lang=ru on links within the site, so a shared or clicked page stays Russian.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.classList.contains('lang-btn')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.searchParams.has('lang')) return;
    u.searchParams.set('lang', 'ru');
    a.href = u.pathname + u.search + u.hash;
  }, true);

  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const MONTHS = { Jan: 'янв.', Feb: 'февр.', Mar: 'мар.', Apr: 'апр.', May: 'мая', Jun: 'июн.', Jul: 'июл.', Aug: 'авг.', Sep: 'сент.', Oct: 'окт.', Nov: 'нояб.', Dec: 'дек.' };
  const date = (mon, d, y) => `${d} ${MONTHS[mon] || mon} ${y}`;

  const RU = {
    // header and navigation
    'a list of all co-op mods': 'список всех кооп-модов',
    'Make your own game co-op ↗': 'Сделай свою игру кооперативной ↗',
    'Couchlink': 'Couchlink',
    'Couchlink: play one game together on one PC, split-screen or one monitor each': 'Couchlink: играйте в одну игру вместе на одном ПК, на разделённом экране или на отдельных мониторах',
    'You can play this one together on one PC with Couchlink': 'В эту игру можно играть вместе на одном ПК через Couchlink',
    'Join Discord': 'Наш Discord',
    'Submit a mod': 'Добавить мод',
    'Skip to search': 'К поиску',
    'Skip to the content': 'К содержимому',
    'Switch to dark theme': 'Тёмная тема',
    'Switch to light theme': 'Светлая тема',
    'Chat with co-op modders on the Co-op Anything Discord': 'Общайтесь с кооп-моддерами в Discord Co-op Anything',
    "Add a co-op mod that's missing (opens a form on GitHub)": 'Добавить недостающий кооп-мод (откроется форма на GitHub)',
    'The open playbook for making any single-player game co-op with an AI agent': 'Открытое руководство, как сделать любую одиночную игру кооперативной с помощью ИИ-агента',
    'All co-op mods': 'Все кооп-моды',
    'See every co-op mod': 'Все кооп-моды',
    // stages
    'Playable': 'Играбельно', 'Partial': 'Частично', 'In development': 'В разработке', 'Abandoned': 'Заброшено', 'Wanted': 'Ждём мод',
    'Play it with friends today': 'Играйте с друзьями уже сегодня',
    'Plays, with gaps in the sync': 'Играется, но синхронизация неполная',
    'Alpha or prototype': 'Альфа или прототип',
    'Stopped, up for revival': 'Остановлен, ждёт возрождения',
    'No co-op mod yet': 'Кооп-мода пока нет',
    'You can play it together now: a working co-op mod, or an official co-op mode.': 'Можно играть вместе уже сейчас: рабочий кооп-мод или официальный кооперативный режим.',
    "Public builds you can play together, but some of the game (story, enemies, saves or the world) doesn't sync yet.": 'Есть публичные сборки для совместной игры, но часть игры (сюжет, враги, сохранения или мир) пока не синхронизируется.',
    'Work in progress: an alpha, a prototype or a research build. Players may see each other, but expect a lot to be missing.': 'В работе: альфа, прототип или исследовательская сборка. Игроки могут видеть друг друга, но многого ещё не хватает.',
    'Its author stopped. Many of these got far and are worth reviving: Co-op Anything has a guide for that.': 'Автор остановился. Многие из этих модов продвинулись далеко и стоят возрождения: в Co-op Anything есть руководство для этого.',
    'Nobody has made this game co-op yet, as far as anyone has found. Up for grabs.': 'Насколько известно, кооп для этой игры ещё никто не сделал. Свободно, берите.',
    // tiers
    'Definitive': 'Эталон', 'Complete': 'Полный', 'Rough': 'Сырой', 'Experimental': 'Экспериментальный', 'None yet': 'Пока нет',
    'The whole game, together, polished. The way to play it with friends now.': 'Вся игра вместе, отполировано. Лучший способ играть с друзьями сейчас.',
    'Play the story start to finish together, or a stable official co-op mode.': 'Сюжет проходится вместе от начала до конца, или стабильный официальный кооп.',
    'You can play together, with known gaps in what syncs or a rough setup.': 'Можно играть вместе, но есть пробелы в синхронизации или сложная настройка.',
    'Alpha builds, or partial sync without the story. Expect desyncs and crashes.': 'Альфа-сборки или частичная синхронизация без сюжета. Ждите рассинхронов и вылетов.',
    'Prototype, research build, or abandoned before it got far.': 'Прототип, исследовательская сборка или заброшен на раннем этапе.',
    'Quality tiers': 'Уровни качества',
    "Tiers start from each project's status, what it's confirmed to sync and how it was tested. S is picked by hand. They're a guide: rate the mods you've played to help the next person.": 'Уровень зависит от статуса проекта, подтверждённой синхронизации и того, как он протестирован. S выставляется вручную. Это ориентир: оценивайте моды, в которые играли, чтобы помочь другим.',
    // kinds
    'Mod': 'Мод', 'Fork or port': 'Форк или порт', 'Decomp port': 'Порт декомпиляции', 'Official mode': 'Официальный режим',
    'Emulator netplay': 'Сетевая игра в эмуляторе', 'Framework or tool': 'Фреймворк или инструмент', 'Multi-game tool': 'Инструмент для многих игр',
    'MOD': 'МОД', 'FORK': 'ФОРК', 'DECOMP': 'ДЕКОМП', 'OFFICIAL': 'ОФИЦ.', 'NETPLAY': 'НЕТПЛЕЙ', 'TOOL': 'ИНСТР.', 'WANTED': 'НУЖЕН',
    // search and filters
    'Can I play it with friends? Search any game: Skyrim, Deus Ex, Zelda...': 'Можно ли играть с друзьями? Найдите любую игру: Skyrim, Deus Ex, Zelda...',
    'Search for a game': 'Поиск игры',
    'Kind': 'Тип', 'Engine': 'Движок', 'Quality': 'Качество', 'How you connect': 'Подключение',
    'All kinds': 'Все типы', 'All engines': 'Все движки', 'Any quality': 'Любое качество', 'Any way': 'Любое',
    'Made with Co-op Anything': 'Сделано с Co-op Anything',
    'Show only the mods made with Co-op Anything, the open playbook for making any single-player game co-op with an AI agent': 'Показать только моды, сделанные с Co-op Anything, открытым руководством по созданию кооператива с ИИ-агентом',
    'Must have': 'Обязательно',
    'Story co-op': 'Сюжетный кооп', 'Synced enemies': 'Общие враги', 'Shared world': 'Общий мир', 'Easy join': 'Простое подключение',
    'Open source': 'Открытый код', 'Tested': 'Протестировано', 'Up for adoption': 'Ищет нового автора',
    'Easy join, no port forwarding': 'Простое подключение, без проброса портов',
    'Play the campaign together: quests, cutscenes or mission progress are shared': 'Кампания вместе: квесты, катсцены или прогресс миссий общие',
    'Both players fight the same enemies': 'Оба игрока сражаются с одними и теми же врагами',
    'Doors, pickups and world changes are the same for everyone': 'Двери, подбираемые предметы и изменения мира общие для всех',
    'Join through Steam or a hosted relay: no port forwarding or VPN': 'Подключение через Steam или ретранслятор: без проброса портов и VPN',
    'Covered by automated tests, or players report playing it': 'Покрыто автотестами или игроки сообщают, что играли',
    'The author stopped and wants someone to take it over': 'Автор остановился и ищет, кто продолжит',
    'Filter by stage': 'Фильтр по стадии', 'Search, filter and sort': 'Поиск, фильтры и сортировка',
    // results
    'Latest releases': 'Последние релизы', 'All releases →': 'Все релизы →',
    'Clear filters': 'Сбросить фильтры', 'Sort by': 'Сортировка', 'Table': 'Таблица', 'Cards': 'Карточки', 'Layout': 'Вид',
    'Best first': 'Сначала лучшие', 'Worst first': 'Сначала худшие', 'Highest first': 'Сначала высокие', 'Lowest first': 'Сначала низкие',
    'Newest first': 'Сначала новые', 'Oldest first': 'Сначала старые', 'Playable first': 'Сначала играбельные', 'Wanted first': 'Сначала ждущие',
    'A to Z': 'От А до Я', 'Z to A': 'От Я до А', 'Most first': 'Сначала больше', 'Fewest first': 'Сначала меньше',
    'Game': 'Игра', 'Name': 'Название', 'Stage': 'Стадия', 'Co-op': 'Кооп', 'Co-op %': 'Кооп %', 'Rating': 'Оценка', 'Stars': 'Звёзды',
    'Latest release': 'Последний релиз', 'Last activity': 'Последняя активность', 'Activity': 'Активность', 'Game release': 'Выход игры',
    'Project start': 'Начало проекта', 'GitHub stars': 'Звёзды на GitHub', 'Trending': 'Популярное',
    'Active': 'Активен', 'Quiet': 'Затих', 'Stalled': 'Застыл',
    'Code pushed in the last 60 days': 'Код обновлялся за последние 60 дней',
    'Last push 2 to 6 months ago': 'Последнее обновление 2–6 месяцев назад',
    'No pushes for over 6 months': 'Нет обновлений больше 6 месяцев',
    'No activity data': 'Нет данных об активности',
    'No release': 'Нет релиза', 'No release yet': 'Релиза пока нет', 'Today': 'Сегодня', 'Yesterday': 'Вчера',
    'No co-op mods match.': 'Подходящих кооп-модов нет.',
    'No co-op project found for this game. Want to be the first?': 'Кооп-проектов для этой игры не найдено. Хотите стать первым?',
    'Nobody may have made this game co-op yet. Clear the filters, or': 'Возможно, кооп для этой игры ещё никто не сделал. Сбросьте фильтры или',
    "tell us about a mod we're missing": 'расскажите нам о моде, которого здесь нет',
    "Players' average rating out of 10. Open a mod to rate it.": 'Средняя оценка игроков из 10. Откройте мод, чтобы оценить его.',
    "How much of the game you can play together: an estimate from what's synced, replaced by players' votes once 3 or more have voted": 'Какую часть игры можно пройти вместе: оценка по тому, что синхронизируется; заменяется голосами игроков, когда проголосуют 3 и более',
    "How much of the game you can play together. It starts as an estimate from the project's status and from what's confirmed to sync between players: the story, enemies, the world, items and seeing each other. Once three or more players have voted on a mod, their average replaces the estimate.": 'Какую часть игры можно пройти вместе. Сначала это оценка по статусу проекта и подтверждённой синхронизации: сюжет, враги, мир, предметы и видимость друг друга. Когда за мод проголосуют трое и больше игроков, оценку заменяет их среднее.',
    'estimate, no votes yet': 'оценка, голосов пока нет', 'no ratings yet': 'оценок пока нет', 'Your rating': 'Ваша оценка',
    'Co-op mods': 'Кооп-моды', 'Close': 'Закрыть',
    // details
    "What's synced": 'Что синхронизируется', 'About this project': 'О проекте', 'Features': 'Особенности', 'What you need': 'Что нужно',
    'Featured playthrough': 'Прохождение', 'Sources': 'Источники', 'Where people looked': 'Где искали', 'Update from the devs': 'Новости от разработчиков',
    'Synced': 'Синхр.', 'Partly': 'Частично', 'Not synced': 'Нет', 'Unknown': 'Неизвестно', 'Per player': 'У каждого своё', 'Shared': 'Общее',
    'See each other': 'Видят друг друга', 'Story': 'Сюжет', 'Enemies': 'Враги', 'World': 'Мир', 'Items': 'Предметы',
    'Players': 'Игроки', 'Connect': 'Подключение', 'Maintained by': 'Поддерживает', 'Players say': 'Мнение игроков',
    'Yes': 'Да', 'No': 'Нет', 'Not stated': 'Не указано', 'Not checked': 'Не проверено',
    'Automated tests': 'Автотесты', 'Player reports': 'Отзывы игроков', 'Dedicated server': 'Выделенный сервер', 'Direct IP': 'Прямой IP',
    'Steam (no port forwarding)': 'Steam (без проброса портов)', 'Hosted relay': 'Ретранслятор', 'LAN': 'Локальная сеть', 'VPN needed': 'Нужен VPN',
    'Open repository ↗': 'Репозиторий ↗', 'Repository ↗': 'Репозиторий ↗', 'Project page ↗': 'Страница проекта ↗', 'Website ↗': 'Сайт ↗',
    'Co-op Anything write-up ↗': 'Разбор в Co-op Anything ↗', 'Suggest a correction': 'Предложить исправление', 'Game page': 'Страница игры',
    'Discord topic': 'Тема в Discord',
    'Something wrong or out of date? Opens an issue on GitHub with this mod filled in': 'Что-то неверно или устарело? Откроет задачу на GitHub с этим модом',
    'Chat with this mod\'s devs in their topic on the Co-op Anything Discord': 'Общайтесь с разработчиками мода в их теме в Discord Co-op Anything',
    'Stages': 'Стадии', 'No release found': 'Релиз не найден',
    'From the devs': 'От разработчиков', 'Edit listing': 'Редактировать', 'Download ↗': 'Скачать ↗', 'Dev login': 'Вход для разработчиков',
    "Mod devs: log in with Discord to edit your mod's listing": 'Разработчики модов: войдите через Discord, чтобы редактировать страницу мода',
    'Log out': 'Выйти', 'You can edit every listing.': 'Вы можете редактировать все страницы.', 
    'Write': 'Текст', 'Preview': 'Просмотр', 'Video link': 'Ссылка на видео', 'YouTube, Vimeo or Streamable': 'YouTube, Vimeo или Streamable',
    'Website': 'Сайт', 'Download': 'Скачать', 'Latest version': 'Последняя версия', 'Keep as listed': 'Как в каталоге',
    'Cancel': 'Отмена', 'Save': 'Сохранить', 'Saving…': 'Сохранение…', 'Saved. It’s live on your listing now.': 'Сохранено. Изменения уже на сайте.',
    'Nothing changed.': 'Ничего не изменилось.', 'Description': 'Описание', '(markdown, shown on your listing)': '(markdown, показывается на странице мода)',
    'Short news': 'Короткая новость', '(one line, no links, shows as "Update from the devs")': '(одна строка, без ссылок, показывается как «Новости от разработчиков»)',
    'My projects': 'Мои проекты', 'Full game page →': 'Страница игры →', 'View': 'Открыть', 'Edit': 'Редактировать',
    'Log in with Discord': 'Войти через Discord', 'Your mods': 'Ваши моды', 'Mods with a Discord topic': 'Моды с темой в Discord', 'Any mod': 'Любой мод',
    'Discord topic linked': 'Тема в Discord связана',
    'Open full page →': 'Открыть полную страницу →', 'Rate it and vote on its co-op %': 'Оценить и проголосовать за кооп %', 'Repository ↗': 'Репозиторий ↗',
    "Every detail, the devs' description and video, sources and comments.": 'Все подробности, описание и видео от разработчиков, источники и комментарии.',
    'Rated by its devs': 'Оценено разработчиками', 'Card details': 'Карточка мода', 'Cover image link': 'Ссылка на обложку',
    'an image file, or from Steam, Imgur, GitHub': 'файл изображения или ссылка со Steam, Imgur, GitHub', 'Tier': 'Уровень',
    'your own rating; S is picked by MJ': 'ваша оценка; S ставит только MJ', 'Co-op %': 'Кооп %', "0 to 100; players' votes replace it": 'от 0 до 100; голоса игроков заменяют её',
    'Engine': 'Движок', 'How you connect': 'Подключение',
    'Save changes': 'Сохранить', "Change anything below. Empty fields show what's listed now. Nothing is saved until you press Save.": 'Измените что угодно ниже. Пустые поля показывают то, что указано сейчас. Ничего не сохранится, пока вы не нажмёте «Сохранить».',
    'Your description shows here as you type.': 'Здесь появится ваше описание, пока вы пишете.', 'Short news': 'Короткая новость', 'Download page': 'Страница загрузки',
    'Latest version': 'Последняя версия', 'Saved. It’s live now.': 'Сохранено. Уже на сайте.', 'Nothing changed yet.': 'Пока ничего не изменилось.',
    '. The site is open source:': '. Сайт с открытым кодом:', 'contribute on GitHub': 'помогите на GitHub', 'Contribute on GitHub': 'Помочь на GitHub',
    'Recommended': 'Рекомендуем', 'Which one should I play? →': 'Какой выбрать? →', 'Best bet so far': 'Лучший вариант пока', 'Every project, side by side': 'Все проекты рядом',
    'Rate it and vote on its co-op %': 'Оцените мод и проголосуйте за его кооп %',
    'Ratings and comments': 'Оценки и комментарии', 'Submit it': 'Добавьте его', 'Breadcrumb': 'Навигация',
    // voting
    'Community check': 'Проверка сообщества', 'How much of the game could you play together?': 'Какую часть игры вы смогли пройти вместе?',
    'How did your session go?': 'Как прошла ваша игра?', 'Finished it together': 'Прошли вместе', 'Played a lot, some bugs': 'Играли долго, были баги',
    'Broke after a while': 'Сломалось через время', 'Couldn’t get it running': 'Не удалось запустить', "Couldn't get it running": 'Не удалось запустить',
    'Send my vote': 'Отправить голос', 'Update my vote': 'Обновить голос', 'Sending…': 'Отправка…', 'Sending...': 'Отправка...',
    'No account needed. One vote per person; you can change it.': 'Аккаунт не нужен. Один голос на человека, его можно изменить.',
    'Thanks! Your vote counts now.': 'Спасибо! Ваш голос учтён.',
    'You voted on this one. Sending again replaces your vote.': 'Вы уже голосовали. Повторная отправка заменит ваш голос.',
    'Move the slider, pick a rating or say how it went first.': 'Сначала передвиньте ползунок, выберите оценку или расскажите, как прошла игра.',
    'Couldn’t reach the vote service. Try again later.': 'Сервис голосования недоступен. Попробуйте позже.',
    'Something went wrong. Please try again later.': 'Что-то пошло не так. Попробуйте позже.',
    'Voting opens on the live site.': 'Голосование работает на основном сайте.',
    'Played one? Open it, say how much of the game worked in co-op, rate it and say how your session went. No account needed, and one vote per mod per person (you can change yours).': 'Играли в один из них? Откройте его, укажите, какая часть игры работала в коопе, оцените и расскажите, как прошла игра. Аккаунт не нужен, один голос за мод на человека (его можно изменить).',
    // footer and thanks
    'Thanks': 'Спасибо', 'These people made CoOp:Anything better.': 'Эти люди сделали CoOp:Anything лучше.',
    'or join the': 'или заходите в наш', 'to join them.': ', чтобы присоединиться к ним.', 'Discord': 'Discord',
    'Missing a co-op mod?': 'Не хватает кооп-мода?', 'Submit it on GitHub': 'Добавьте его на GitHub',
    '. Spotted a mistake, or have an idea for the site?': '. Нашли ошибку или есть идея для сайта?', 'Send feedback': 'Отправить отзыв',
    '. Chat with modders on the': '. Общайтесь с моддерами в', 'Co-op Anything Discord': 'Discord Co-op Anything',
    'The list comes from the': 'Список взят из', 'Co-op Anything directory': 'каталога Co-op Anything',
    ', where every entry links its sources; repository stats come from GitHub. Want a game made co-op?': ', где у каждой записи есть источники; статистика репозиториев взята с GitHub. Хотите, чтобы игру сделали кооперативной?',
    'shows your AI agent how to build or revive a co-op mod.': 'показывает вашему ИИ-агенту, как создать или возродить кооп-мод.',
    '. Want to build it yourself?': '. Хотите сделать сами?', 'walks your AI agent through it.': 'проведёт вашего ИИ-агента по шагам.',
    'CoOp:Anything is built on': 'CoOp:Anything построен на',
    "by rikuwru (MIT License), and like it, with AI help. Every mod listed needs your own copy of the game; CoOp:Anything links to projects and hosts no game files. Box art belongs to each game's publisher.": 'от rikuwru (лицензия MIT) и, как и он, с помощью ИИ. Для каждого мода нужна своя копия игры; CoOp:Anything даёт ссылки на проекты и не хранит файлы игр. Обложки принадлежат издателям игр.',
    'Every mod listed needs your own copy of the game. CoOp:Anything links to projects and hosts no game files.': 'Для каждого мода нужна своя копия игры. CoOp:Anything даёт ссылки на проекты и не хранит файлы игр.',
    'Data snapshot': 'Снимок данных', ', from the': ', из', "; repository stats from GitHub. Box art belongs to each game's publisher.": '; статистика репозиториев с GitHub. Обложки принадлежат издателям игр.',
    'RSS feed': 'RSS-лента', 'Report a bug': 'Сообщить об ошибке', '. Built on': '. Построен на', 'by rikuwru (MIT License), with AI help.': 'от rikuwru (лицензия MIT), с помощью ИИ.',
    'Made Recomp Haven, the open source site CoOp:Anything is built on': 'Создал Recomp Haven, открытый сайт, на котором построен CoOp:Anything',
    'CoOp:Anything: a list of all co-op mods': 'CoOp:Anything: список всех кооп-модов',
  };

  const PATTERNS = [
    [/^(\d+) days? ago$/, (_, n) => `${n} ${plural(+n, 'день', 'дня', 'дней')} назад`],
    [/^(\d+) months? ago$/, (_, n) => `${n} ${plural(+n, 'месяц', 'месяца', 'месяцев')} назад`],
    [/^(\d+) years? ago$/, (_, n) => `${n} ${plural(+n, 'год', 'года', 'лет')} назад`],
    [/^1 year ago$/, () => '1 год назад'],
    [/^(\d+) mods?$/, (_, n) => `${n} ${plural(+n, 'мод', 'мода', 'модов')}`],
    [/^(\d+) projects?$/, (_, n) => `${n} ${plural(+n, 'проект', 'проекта', 'проектов')}`],
    [/^(\d+) games?$/, (_, n) => `${n} ${plural(+n, 'игра', 'игры', 'игр')}`],
    [/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/, (_, m, d, y) => date(m, d, y)],
    [/^Last push ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/, (_, m, d, y) => `Последнее обновление ${date(m, d, y)}`],
    [/^Last checked ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\.$/, (_, m, d, y) => `Последняя проверка ${date(m, d, y)}.`],
    [/^(\d+)% of the game playable together(.*)$/, (_, n, rest) => `${n}% игры можно пройти вместе${rest.startsWith(' (estimate)') ? ' (оценка)' : rest ? ': оценка по тому, что синхронизируется; её заменяют голоса игроков' : ''}`],
    [/^([SABCDX]) · (.+?) \((\d+)\)$/, (_, t, l, n) => `${t} · ${RU[l] || l} (${n})`],
    [/^([SABCDX]): (.+)$/, (_, t, l) => `${t}: ${RU[l] || l}`],
    [/^(.+) \((\d+)\)$/, (_, l, n) => (RU[l] ? `${RU[l]} (${n})` : null)],
    [/^(\d+) projects let you play (.+) together\. Here's how they compare, and which one to start with\.$/, (_, n, g) => `${n} ${plural(+n, 'проект позволяет', 'проекта позволяют', 'проектов позволяют')} играть в ${g} вместе. Вот их сравнение и с чего начать.`],
    [/^Know another co-op mod for (.+)\?$/, (_, g) => `Знаете другой кооп-мод для ${g}?`],
    [/^Your own copy of (.+)\.$/, (_, g) => `Своя копия ${g}.`],
    [/^Sort direction: (.+)\. Click to reverse\.$/, (_, d) => `Порядок: ${RU[d] || d}. Нажмите, чтобы обратить.`],
    [/^by (.+)$/, (_, who) => `от ${who}`],
    [/^Editing (.+)$/, (_, n) => `Редактирование: ${n}`],
    [/^As listed \((.+)\)$/, (_, v) => `Как указано (${RU[v] || v})`],
    [/^Tier as listed \((.+)\)$/, (_, v) => `Уровень как указано (${v})`],
    [/^Every detail, the devs' description and video, and how it compares with the other (\d+) projects? for (.+)\.$/, (_, n, g) => `Все подробности, описание и видео от разработчиков и сравнение с ${n === '1' ? 'другим проектом' : `другими проектами (${n})`} для ${g}.`],
    [/^You can edit (\d+) listings?\.$/, (_, n) => `Вы можете редактировать ${n} ${plural(+n, 'страницу', 'страницы', 'страниц')}.`],
    [/^(\d+) projects cover this game\.$/, (_, n) => `Этой игре ${plural(+n, 'посвящён', 'посвящено', 'посвящено')} ${n} ${plural(+n, 'проект', 'проекта', 'проектов')}.`],
  ];

  function tr(text) {
    const core = text.trim();
    if (!core || !/[A-Za-z]/.test(core)) return null;
    let out = RU[core];
    if (out == null) {
      for (const [re, fn] of PATTERNS) {
        const m = core.match(re);
        if (m) { out = fn(...m); if (out != null) break; }
      }
    }
    if (out == null) return null;
    return text.replace(core, out);
  }

  // The count line is built from several nodes, so it's rewritten as a whole.
  function count(el) {
    const strongs = el.querySelectorAll('strong');
    const txt = el.textContent;
    let m = txt.match(/^(\d+) co-op projects across (\d+) games$/);
    if (m) {
      el.innerHTML = `<strong>${m[1]}</strong> ${plural(+m[1], 'кооп-проект', 'кооп-проекта', 'кооп-проектов')} для <strong>${m[2]}</strong> ${plural(+m[2], 'игры', 'игр', 'игр')}`;
      return;
    }
    m = txt.match(/^Showing (\d+) of (\d+) co-op projects$/);
    if (m && strongs.length) el.innerHTML = `Показано <strong>${m[1]}</strong> из ${m[2]} кооп-проектов`;
  }

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  let busy = false;
  function walk(root) {
    busy = true;
    try {
      if (root.nodeType === 3) { const t = tr(root.nodeValue); if (t != null && t !== root.nodeValue) root.nodeValue = t; return; }
      if (root.nodeType !== 1) return;
      if (root.matches?.('#count')) count(root);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n = root;
      do {
        if (n.nodeType === 3) {
          const p = n.parentNode;
          if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE')) continue;
          const t = tr(n.nodeValue);
          if (t != null && t !== n.nodeValue) n.nodeValue = t;
        } else {
          if (n.id === 'count') count(n);
          for (const a of ATTRS) {
            const v = n.getAttribute?.(a);
            if (v) { const t = tr(v); if (t != null && t !== v) n.setAttribute(a, t); }
          }
        }
      } while ((n = w.nextNode()));
    } finally {
      busy = false;
    }
  }

  function start() {
    walk(document.body);
    const t = tr(document.title);
    if (t) document.title = t;
    else document.title = document.title.replace(/ co-op: (\d+) mods? compared · CoOp:Anything$/, (_, n) => `: ${n} ${plural(+n, 'кооп-мод', 'кооп-мода', 'кооп-модов')} в сравнении · CoOp:Anything`)
      .replace(/ · CoOp:Anything$/, ' · CoOp:Anything');
    new MutationObserver((muts) => {
      if (busy) return;
      for (const m of muts) {
        if (m.type === 'characterData') walk(m.target);
        else if (m.type === 'attributes') walk(m.target);
        else m.addedNodes.forEach(walk);
        if (m.target.id === 'count' || m.target.closest?.('#count')) count(document.getElementById('count'));
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
