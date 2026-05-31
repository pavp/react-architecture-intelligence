export default function DashboardPage() {
  return <main><A /><B /><C /><D /></main>;
}

function A() { return <section />; }
function B() { return <section />; }
function C() { return <section><D /></section>; }
function D() { return <section />; }
