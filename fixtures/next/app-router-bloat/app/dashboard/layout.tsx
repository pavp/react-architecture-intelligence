'use client';

export default function DashboardLayout() {
  return <div><A /><B /><C /><D /></div>;
}

function A() { return <section />; }
function B() { return <section />; }
function C() { return <section><D /></section>; }
function D() { return <section />; }
