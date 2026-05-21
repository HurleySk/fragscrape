export const PARFUMO_SELECTORS = {
  login: {
    form: 'form.login-modal-form',
    usernameInput: '#username',
    passwordInput: '#password',
    mobileMenuAuth: '.mobile-menu-auth',
    logoutLink: 'a[href*="board/logout"], a[href*="action/logout"]',
  },
  actionNav: {
    container: '.ptabs-container.pd-nav',
    collectionLink: '.pd-nav a',
    rateLink: '.pd-nav a',
  },
  rating: {
    barfiller: '.barfiller_element.rating-details[data-type]',
    scent: '.barfiller_element[data-type="scent"]',
    longevity: '.barfiller_element[data-type="durability"]',
    sillage: '.barfiller_element[data-type="sillage"]',
    bottle: '.barfiller_element[data-type="bottle"]',
    value: '.barfiller_element[data-type="pricing"]',
    barFill: '.fill[data-percentage]',
    barValue: '.barfiller .bold',
  },
  review: {
    tab: '.action_tab_reviews',
    statementsTab: '.action_tab_statements',
    reviewsHolder: '#reviews_holder',
    reviewArticle: 'article.review',
    reviewText: '.review_text',
    reviewHeader: '.review_header',
  },
  contentTabs: {
    container: '.ptabs-container.ptabs-pd',
    info: '.action_order_pd[data-order^="1"]',
    reviews: '.action_tab_reviews',
    statements: '.action_tab_statements',
    photos: '.action_tab_photos',
    chart: '.action_order_classification',
  },
};

export const PARFUMO_URLS = {
  login: 'https://www.parfumo.com/',
  profile: (username: string) => `https://www.parfumo.com/Users/${username}`,
  collection: (username: string, category: string) =>
    `https://www.parfumo.com/Users/${username}/Collection/${category}`,
};
