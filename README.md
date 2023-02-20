受 `react-lazyload` 启发, 使用 `typescript` 开发

# 原项目地址

https://github.com/twobin/react-lazyload

使用方式也可参考


# 注意事项

- perf: 优化合并了 `checkNormalVisible` 和 `checkOverflowVisible` `方法，因为实现原理是一致的。checkOverflowVisible` 是另一个方法的超集。另外原来 `checkNormalVisible` 中高度都取自 `window` 并没有来自 `scrollContainer` 的对应 `dom`，其实是有 `bug` 的。

- perf: 优化了 `checkVisible` 的实现，老代码中，无论是否启用 `overflow` 属性，都会去遍历寻找滚动的父元素的，这是消耗性能的。

        // 老代码
        const parent = scrollParent(node);
        const isOverflow =
            component.props.overflow &&
            parent !== node.ownerDocument &&
            parent !== document &&
            parent !== document.documentElement;
            const visible = isOverflow
        ? checkOverflowVisible(component, parent)
        : checkNormalVisible(component);

        // 新代码
        const visible = checkElementVisible(component, component.parent);

- perf: 优化了 once 的实现。

  - 调整了 `purgePending()` 的执行顺序，因为 `pending` 中的元素是已经展示了，才被添加到 `pending` 中的，所以可以在 `checkVisible` 前执行。
  - 另外修改了 `once` 默认为 `true`, 因为我的项目只是单纯的想做懒加载，没有防爬虫和复杂列表性能问题，所以修改为 `true`，而且我认为更高性能的默认值可以降低使用者的使用成本。

        
        // 老代码
        const lazyLoadHandler = () => {
        for (let i = 0; i < listeners.length; ++i) {
        const listener = listeners[i];
        checkVisible(listener);
        }
        purgePending();
        }

        // 新代码
        const lazyLoadHandler = () => {
            purgePending();
            for (let i = 0; i < listeners.length; ++i) {
                const listener = listeners[i];
                checkVisible(listener);
            }
        }

        // 老代码 props.once 默认值 false
        // 新代码 props.once 默认值 true


- perf: 优化了 `overflow` 的实现，对 `parent` 的赋值放到了 `componentDidMount` 中，而不用在 `checkVisible` 时，每次都去找父滚动容器。

- perf&break-change: `简化了 scrollParent` 的实现
  - 如果想用 overflow 属性来自动寻找父滚动容器的方法，需要保证子元素的第一个能找到的 `overflow-x|-y `为 `auto` 或 `scroll` 的就是滚动容器，原代码中对 `overflow` 的校验是 `x, y `都要是自动或滚动，不太符合我的场景。
  - 目前项目中想自动寻找父容器的原因是，公共组件在不同路由使用，可能多个路由的滚动容器类名不同，如果每个路由都要单独传 `scrollContainer` 改造成本太大，所以采用自动寻找模式

        // 新代码
        const findScrollParent = (node: HTMLElement | null): HTMLElement => {
            if (!node || !(node instanceof HTMLElement)) {
                return document.documentElement;
            }

            const overflowRegex = /(auto|scroll)/;

            let parent = node.parentElement;
            while (parent) {
                const { overflow, overflowX, overflowY } = window.getComputedStyle(parent);

                if (overflowRegex.test(overflow) || overflowRegex.test(overflowX) || overflowRegex.test(overflowY)) {
                    return parent;
                }

                parent = parent.parentElement;
            }

            return node.ownerDocument?.documentElement || document.documentElement;
        };

- break-change：移除了 `throttle` 和 `debounce` 实现，因为很多项目都有自己的防抖和截流，而且每个子元素都可以修改父容器公共的 `scroll` 事件，其实不太科学，增加了绑定，解绑 `scroll` 事件的复杂度，如果想实现，可能会再增加全局方法，可以对 `scroll` 事件做统一的防抖，截流设置。

- fix：修复了占位消失时，图片未出现，导致 `getBoundingClientRect` 取值错误的问题

- break-change: 移除了 `forceCheck` , `forceVisible`, 装饰器等功能
