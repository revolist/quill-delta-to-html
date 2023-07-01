/**
 * The regular expression attributeRegex is used to extract attribute name-value pairs from the HTML string. It matches attributes in the form attribute="value" or attribute='value'. The extracted attributes are then transformed into an object by reducing the attributeMatches array.
 * In the example provided, the htmlString variable contains <p class="a" id="paragraph"><span style="color:#374151">Sure!</span></p>. When running the code, the firstTag variable will hold the following object:

javascript
Copy code
{
  tag: "p",
  attributes: {
    class: "a",
    id: "paragraph"
  }
}
This allows you to access both the tag name and its attributes for further processing or manipulation.
 */
export function getFirstTagFromString(htmlString: string) {
  const tagRegex = /<([^>\s/]+)/;
  const match = htmlString.match(tagRegex);
  if (match) {
    const tag = match[1];
    const attributeRegex = /(\S+)\s*=\s*["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/g;
    const attributeMatches = htmlString.match(attributeRegex);
    const attributes = attributeMatches
      ? attributeMatches.reduce((acc: Record<string, any>, match) => {
          const regex = match.match(
            /(\S+)\s*=\s*["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/
          );
          if (regex) {
            const [_, attrName, attrValue] = regex;
            acc[attrName] = attrValue;
          }
          return acc;
        }, {})
      : {};
    return { tag, attributes };
  }
  return null;
}

export function deleteTagFromString(htmlString: string, tag: string) {
  const openingTagRegex = new RegExp(`<${tag}(\\s|>)`);
  const closingTagRegex = new RegExp(`</${tag}>`);
  const openingTagMatch = htmlString.match(openingTagRegex);
  const closingTagMatch = htmlString.match(closingTagRegex);

  if (
    openingTagMatch &&
    closingTagMatch &&
    typeof openingTagMatch.index !== 'undefined' &&
    typeof closingTagMatch.index !== 'undefined'
  ) {
    const startIndex = openingTagMatch.index;
    const endIndex = closingTagMatch.index + closingTagMatch[0].length;
    const deletedString = htmlString.slice(startIndex, endIndex);
    const modifiedString = htmlString.replace(deletedString, '');
    return modifiedString;
  }

  return htmlString;
}
