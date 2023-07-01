export interface ITagKeyValue {
  key: string;
  value?: string;
}

enum EncodeTarget {
  Html = 0,
  Url = 1,
}

function getAttr(attrs?: ITagKeyValue | ITagKeyValue[]) {
  let attrsStr = '';
  if (attrs) {
    const arrAttrs = ([] as ITagKeyValue[]).concat(attrs);
    attrsStr = arrAttrs
      .map((attr) => `${attr.key}${attr.value ? `="${attr.value}"` : ''}`)
      .join(' ');
  }
  return attrsStr;
}

export function makeStartTag(
  tag: any,
  attrs: ITagKeyValue | ITagKeyValue[] | undefined = undefined
) {
  if (!tag) {
    return '';
  }

  let closing = '>';
  const attrsStr = getAttr(attrs);
  if (tag === 'img') {
    closing = '/>';
  }
  if (tag === 'br') {
    closing = '/>';
  }
  return `<${tag}${attrsStr ? ` ${attrsStr}` : ''}${closing}`;
}

export function makeEndTag(tag: any = '') {
  return (tag && `</${tag}>`) || '';
}

export function decodeHtml(str: string) {
  return encodeMappings(EncodeTarget.Html).reduce(decodeMapping, str);
}

export function encodeHtml(str: string, preventDoubleEncoding = true) {
  if (preventDoubleEncoding) {
    str = decodeHtml(str);
  }
  return encodeMappings(EncodeTarget.Html).reduce(encodeMapping, str);
}

export function encodeLink(str: string) {
  let linkMaps = encodeMappings(EncodeTarget.Url);
  let decoded = linkMaps.reduce(decodeMapping, str);
  return linkMaps.reduce(encodeMapping, decoded);
}

function encodeMappings(mtype: EncodeTarget) {
  let maps = [
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#x27;'],
    ['\\/', '&#x2F;'],
    ['\\(', '&#40;'],
    ['\\)', '&#41;'],
  ];
  if (mtype === EncodeTarget.Html) {
    return maps.filter(
      ([v, _]) => v.indexOf('(') === -1 && v.indexOf(')') === -1
    );
  } else {
    // for url
    return maps.filter(([v, _]) => v.indexOf('/') === -1);
  }
}
function encodeMapping(str: string, mapping: string[]) {
  return str.replace(new RegExp(mapping[0], 'g'), mapping[1]);
}
function decodeMapping(str: string, mapping: string[]) {
  return str.replace(new RegExp(mapping[1], 'g'), mapping[0].replace('\\', ''));
}
