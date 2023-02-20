/**
 * 懒加载组件
 */
import React, { Component } from "react";

const LISTEN_FLAG = "data-lazyload-listened";
const listeners: LazyLoad[] = [];
let pending: LazyLoad[] = [];
let passiveEvent: { capture: false; passive: true } | false = false;

const testPassiveEventSupported = () => {
  // try to handle passive events
  let passiveEventSupported = false;
  try {
    const opts = Object.defineProperty({}, "passive", {
      // eslint-disable-next-line getter-return
      get() {
        passiveEventSupported = true;
      },
    });
    window.addEventListener("test", () => {}, opts);
  } catch (e) {
    console.log(e);
  }
  // if they are supported, setup the optional params
  // IMPORTANT: FALSE doubles as the default CAPTURE value!
  passiveEvent = passiveEventSupported
    ? { capture: false, passive: true }
    : false;
};

testPassiveEventSupported();

const findScrollParent = (node: HTMLElement | null): HTMLElement => {
  if (!node || !(node instanceof HTMLElement)) {
    return document.documentElement;
  }

  const overflowRegex = /(auto|scroll)/;

  let parent = node.parentElement;
  while (parent) {
    const { overflow, overflowX, overflowY } = window.getComputedStyle(parent);

    if (
      overflowRegex.test(overflow) ||
      overflowRegex.test(overflowX) ||
      overflowRegex.test(overflowY)
    ) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return node.ownerDocument?.documentElement || document.documentElement;
};

/**
 * Check if `component` is visible in overflow container `parent`
 * @param  {node} component React component
 * @param  {node} parent    component's scroll parent
 * @return {bool}
 */
const checkElementVisible = (
  component: LazyLoad,
  parent: HTMLElement | undefined
) => {
  const node = component.ref.current;

  if (!node) return false;
  if (!parent) return null;

  const {
    top: parentTop,
    left: parentLeft,
    height: parentHeight,
    width: parentWidth,
  } = parent.getBoundingClientRect();

  const windowInnerHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const windowInnerWidth =
    window.innerWidth || document.documentElement.clientWidth;

  // calculate top and height of the intersection of the element's scrollParent and viewport
  const intersectionTop = Math.max(parentTop, 0); // intersection's top relative to viewport
  const intersectionLeft = Math.max(parentLeft, 0); // intersection's left relative to viewport
  const intersectionHeight =
    Math.min(windowInnerHeight, parentTop + parentHeight) - intersectionTop; // height
  const intersectionWidth =
    Math.min(windowInnerWidth, parentLeft + parentWidth) - intersectionLeft; // width

  // check whether the element is visible in the intersection
  const { top, left, height, width } = node.getBoundingClientRect();

  const offsetTop = top - intersectionTop; // element's top relative to intersection
  const offsetLeft = left - intersectionLeft; // element's left relative to intersection

  const offsets = Array.isArray(component.props.offset)
    ? component.props.offset
    : [component.props.offset, component.props.offset]; // Be compatible with previous API

  console.log(
    parentHeight,
    offsetTop,
    offsets[0],
    intersectionHeight,
    offsetTop - offsets[0] <= intersectionHeight &&
      offsetTop + height + offsets[1] >= 0 &&
      offsetLeft - offsets[0] <= intersectionWidth &&
      offsetLeft + width + offsets[1] >= 0
  );
  return (
    offsetTop - offsets[0] <= intersectionHeight &&
    offsetTop + height + offsets[1] >= 0 &&
    offsetLeft - offsets[0] <= intersectionWidth &&
    offsetLeft + width + offsets[1] >= 0
  );
};

/**
 * Detect if element is visible in viewport, if so, set `visible` state to true.
 * If `once` prop is provided true, remove component as listener after checkVisible
 *
 * @param  {React} component   React component that respond to scroll and resize
 */
const checkVisible = function checkVisible(component: LazyLoad) {
  const node = component.ref.current;
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const visible = checkElementVisible(component, component.parent);
  if (visible) {
    // Avoid extra render if previously is visible
    if (!component.visible) {
      if (component.props.once) {
        pending.push(component);
      }

      // eslint-disable-next-line no-param-reassign
      component.visible = true;
      component.forceUpdate();
    }
  } else if (!(component.props.once && component.visible)) {
    // eslint-disable-next-line no-param-reassign
    component.visible = false;
    if (component.props.unmountIfInvisible) {
      component.forceUpdate();
    }
  }
};

const purgePending = function purgePending() {
  pending.forEach((component) => {
    const index = listeners.indexOf(component);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  });

  pending = [];
};

const lazyLoadHandler = () => {
  // Remove `once` component in listeners
  purgePending();
  for (let i = 0; i < listeners.length; ++i) {
    const listener = listeners[i];
    checkVisible(listener);
  }
};

type LazyLoadProps = {
  /**
   * 类名
   */
  className?: string;
  /**
   * 前缀
   */
  classNamePrefix?: string;
  /**
   * 是否仅检测一次
   */
  once?: boolean;
  /**
   * 元素高度
   */
  height: number;
  /**
   * 预渲染范围
   */
  offset: number | number[];
  /**
   * 自动检查父元素
   */
  overflow?: boolean;
  /**
   * 窗口大小变化时是否检查
   */
  resize?: boolean;
  /**
   * 滚动容器滚动时检查
   */
  scroll?: boolean;
  /**
   * 子元素
   */
  children: React.ReactNode;
  /**
   * 占位元素
   */
  placeholder?: React.ReactNode;
  /**
   * 滚动容器选择器
   */
  scrollContainer?: string;
  /**
   * 不可见时更新视图
   */
  unmountIfInvisible?: boolean;
  /**
   * 样式
   */
  style?: React.CSSProperties;
};

class LazyLoad extends Component<LazyLoadProps> {
  visible = false;

  ref = React.createRef<HTMLDivElement>();

  parent: HTMLElement | undefined;

  componentDidMount() {
    // It's unlikely to change delay type on the fly, this is mainly
    // designed for tests
    let scrollport: HTMLElement | null = document.documentElement;
    const { scrollContainer } = this.props;
    if (scrollContainer) {
      scrollport = document.querySelector<HTMLElement>(scrollContainer);
    }

    if (!scrollport) return;

    this.parent = scrollport;

    if (this.props.overflow) {
      const parent = findScrollParent(this.ref.current);
      if (parent && typeof parent.getAttribute === "function") {
        const listenerCount = 1 + Number(parent.getAttribute(LISTEN_FLAG) || 0);
        if (listenerCount === 1) {
          parent.addEventListener("scroll", lazyLoadHandler, passiveEvent);
        }
        parent.setAttribute(LISTEN_FLAG, `${listenerCount}`);
      }

      this.parent = parent;
    } else if (listeners.length === 0) {
      const { scroll, resize } = this.props;

      if (scroll) {
        scrollport.addEventListener("scroll", lazyLoadHandler);
      }

      if (resize) {
        scrollport.addEventListener("resize", lazyLoadHandler);
      }
    }

    listeners.push(this);
    checkVisible(this);
  }

  shouldComponentUpdate() {
    return this.visible;
  }

  componentWillUnmount() {
    const { parent } = this;

    if (this.props.overflow) {
      if (parent && typeof parent.getAttribute === "function") {
        const listenerCount = Number(parent.getAttribute(LISTEN_FLAG) || 0) - 1;
        if (listenerCount === 0) {
          parent.removeEventListener("scroll", lazyLoadHandler, passiveEvent);
          parent.removeAttribute(LISTEN_FLAG);
        } else {
          parent.setAttribute(LISTEN_FLAG, `${listenerCount}`);
        }
      }
    }

    const index = listeners.indexOf(this);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0 && parent) {
      parent.removeEventListener("resize", lazyLoadHandler, passiveEvent);
      parent.removeEventListener("scroll", lazyLoadHandler, passiveEvent);
    }
  }

  render() {
    const { height, children, placeholder, className, classNamePrefix, style } =
      this.props;

    return (
      <div
        className={`${classNamePrefix}-wrapper ${className}`}
        ref={this.ref}
        style={{ height, ...style }}
      >
        {this.visible
          ? children
          : placeholder || (
              <div
                style={{ height }}
                className={`${classNamePrefix}-placeholder`}
              />
            )}
      </div>
    );
  }
}

(LazyLoad as any).defaultProps = {
  className: "",
  classNamePrefix: "lazyload",
  once: true,
  offset: 0,
  overflow: false,
  resize: false,
  scroll: true,
  unmountIfInvisible: false,
};

export default LazyLoad;
