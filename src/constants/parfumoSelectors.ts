export const PARFUMO_SELECTORS = {
  login: {
    form: 'form[action*="login"], form.login-form, #login-form',
    usernameInput: 'input[name="username"], input[name="email"], input[type="email"]',
    passwordInput: 'input[name="password"], input[type="password"]',
    profileIndicator: '.user-menu, .profile-link, a[href*="/Users/"], .logged-in',
    logoutLink: 'a[href*="logout"]',
  },
  collection: {
    button: '.collection-button, .btn-collection, [data-action="collection"], .heart-button',
    dropdown: '.collection-dropdown, .collection-modal, .collection-menu',
    categories: {
      wishlist: '[data-collection="wishlist"], .collection-wishlist',
      i_have: '[data-collection="i_have"], .collection-ihave',
      tested: '[data-collection="tested"], .collection-tested',
      i_had: '[data-collection="i_had"], .collection-ihad',
    },
    activeState: '.active, .selected, [aria-checked="true"]',
  },
  rating: {
    container: '.rating-container, .my-rating, .user-rating',
    scent: '.scent-rating input, .scent-slider, [data-rating="scent"]',
    longevity: '.longevity-rating input, .longevity-slider, [data-rating="longevity"]',
    sillage: '.sillage-rating input, .sillage-slider, [data-rating="sillage"]',
    bottle: '.bottle-rating input, .bottle-slider, [data-rating="bottle"]',
    value: '.value-rating input, .value-slider, [data-rating="value"]',
  },
  review: {
    container: '.review-form, .statement-form, .write-review',
    textArea: '.review-text textarea, .statement-text textarea, [name="review"]',
    submitButton: '.review-submit, .statement-submit, button[type="submit"]',
    deleteButton: '.review-delete, .statement-delete',
    existingReview: '.my-review, .my-statement',
    existingReviewText: '.my-review .text, .my-statement .text, .review-body',
  },
  profile: {
    collectionPage: '.collection-list, .my-collection, .perfume-list',
    collectionItem: '.collection-item, .perfume-item',
    collectionItemLink: '.collection-item a[href*="/Perfumes/"], .perfume-item a',
    collectionCategory: '.collection-category, [data-category]',
    username: '.profile-name, .username, .user-name',
  },
};

export const PARFUMO_URLS = {
  login: 'https://www.parfumo.com/',
  profile: (username: string) => `https://www.parfumo.com/Users/${username}`,
  collection: (username: string, category: string) =>
    `https://www.parfumo.com/Users/${username}/Collection/${category}`,
  myProfile: 'https://www.parfumo.com/my-profile',
  settings: 'https://www.parfumo.com/settings',
};
