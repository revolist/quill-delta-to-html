import { ListGroup, ListItem, BlockGroup, TDataGroup } from './group-types';
import { flatten, groupConsecutiveElementsWhile } from './../helpers/array';

class ListNester {
  nest(groups: TDataGroup[]): TDataGroup[] {
    let listBlocked = this.convertListBlocksToListGroups(groups);
    let groupedByListGroups = this.groupConsecutiveListGroups(listBlocked);

    // convert grouped ones into listgroup
    let nested = flatten(
      groupedByListGroups.map((group: TDataGroup | ListGroup[]) => {
        if (!Array.isArray(group)) {
          return group;
        }
        return this.nestListSection(group);
      })
    );

    let groupRootLists = groupConsecutiveElementsWhile(
      nested,
      (curr: TDataGroup, prev: TDataGroup) => {
        if (!(curr instanceof ListGroup && prev instanceof ListGroup)) {
          return false;
        }

        return curr.items[0].item.op.isSameListAs(prev.items[0].item.op);
      }
    );
    return groupRootLists.map((v: TDataGroup | ListGroup[]) => {
      if (!Array.isArray(v)) {
        return v;
      }
      let litems = v.map((g: ListGroup): ListItem[] => g.items);
      return new ListGroup(flatten(litems));
    });
  }

  private convertListBlocksToListGroups(
    items: TDataGroup[]
  ): Array<TDataGroup> {
    let grouped = groupConsecutiveElementsWhile(
      items,
      (g: TDataGroup, gPrev: TDataGroup) => {
        return (
          g instanceof BlockGroup &&
          gPrev instanceof BlockGroup &&
          g.op.isList() &&
          gPrev.op.isList() &&
          g.op.isSameListAs(gPrev.op) &&
          g.op.hasSameIndentationAs(gPrev.op)
        );
      }
    );

    return grouped.map((item: TDataGroup | BlockGroup[]) => {
      if (!Array.isArray(item)) {
        if (item instanceof BlockGroup && item.op.isList()) {
          return new ListGroup([new ListItem(item)]);
        }
        return item;
      }
      return new ListGroup(item.map((g) => new ListItem(g)));
    });
  }

  private groupConsecutiveListGroups(
    items: TDataGroup[]
  ): Array<TDataGroup | ListGroup[]> {
    return groupConsecutiveElementsWhile(
      items,
      (curr: TDataGroup, prev: TDataGroup) => {
        return curr instanceof ListGroup && prev instanceof ListGroup;
      }
    );
  }

  private nestListSection(sectionItems: ListGroup[]): ListGroup[] {
    let indentGroups = this.groupByIndent(sectionItems);

    Object.keys(indentGroups)
      .map(Number)
      .sort()
      .reverse()
      .forEach((indent) => {
        indentGroups[indent].forEach((lg: ListGroup) => {
          let idx = sectionItems.indexOf(lg);
          if (this.placeUnderParent(lg, sectionItems.slice(0, idx))) {
            sectionItems.splice(idx, 1);
          }
        });
      });
    return sectionItems;
  }

  private groupByIndent(items: ListGroup[]): { [index: number]: ListGroup[] } {
    return items.reduce(
      (pv: { [index: number]: ListGroup[] }, cv: ListGroup) => {
        let indent = cv.items[0].item.op.attributes.indent;
        if (indent) {
          pv[indent] = pv[indent] || [];
          pv[indent].push(cv);
        }
        return pv;
      },
      {}
    );
  }

  private placeUnderParent(target: ListGroup, items: ListGroup[]) {
    for (let i = items.length - 1; i >= 0; i--) {
      let elm = items[i];
      if (target.items[0].item.op.hasHigherIndentThan(elm.items[0].item.op)) {
        let parent = elm.items[elm.items.length - 1];
        if (parent.innerList) {
          parent.innerList.items = parent.innerList.items.concat(target.items);
        } else {
          parent.innerList = target;
        }
        return true;
      }
    }
    return false;
  }
}

export { ListNester };
