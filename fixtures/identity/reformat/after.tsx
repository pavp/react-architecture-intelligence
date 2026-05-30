function Widget({ title, count }) {


    const data = useData();
    return (
      <section>
        <h1>{title}</h1>
        <span>{count}</span>
      </section>
    );
}

export default Widget;
