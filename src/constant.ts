//Out of stock keywords
export const OOS_KEYWORDS = [
  'out of stock',
  'sold out',
  'currently unavailable',
  'unavailable',
  'temporarily out of stock',
  'item is out of stock',
  'product is out of stock',
  'no stock',
  'out of inventory',
  'not available',
  'not in stock',
  'item unavailable',
  'this item is unavailable',
  'stock not available',
  'inventory unavailable',
  'sold out online',
  'out of stock online',
  'coming soon', // sometimes treated as unavailable
  'pre-order only', // depends on your logic
  'backorder', // depends on your logic
];

export const OOS_REGEX = [
  /\bnotify me\b.*\b(back|available|stock)\b/,
  /\b(back|available|stock)\b.*\bnotify me\b/,
  /\be-?mail (me )?when( it'?s| its)? (in stock|available|back)\b/,
  /\bjoin waitlist\b/,
  /\bnotify me\b/,
  /\bsign up for restock\b/,
  /\bget notified\b/,
];

export const BUY_CTA =
  /\b(add to (cart|bag|basket)|buy now|purchase now|shop now|order now|get it now|buy it now|add item|add to order|proceed to checkout|checkout now|go to checkout|start order|complete purchase|place order)\b/i;
