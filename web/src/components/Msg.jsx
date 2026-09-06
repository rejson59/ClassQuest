export default function Msg({ type = 'error', children, show }) {
  return <div className={`msg msg-${type} ${show ? 'show' : ''}`}>{children}</div>;
}
