export const getFillControlAction = (tagName) =>
  String(tagName).toLowerCase() === 'select' ? 'select' : 'fill';
