function stackedBars() {

    let data = null;

    this.name = "Grouped Bar";
    this.description = "grouped bar";

    this.getData = () => {
        return data;
    };
    this.loadData = (d) => {
        data = d;
    };
    this.clearTask = () => {
    };

    this.draw = (where) => {

        const spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "data": data,
            "mark": "bar",
            "encoding": {
                "x": {"field": "category", "type": "nominal", "axis": {"labelAngle": 45}},
                "y": {"field": "value", "type": "quantitative"},
                "color": {"field": "type", "type": "nominal"},

            },
            "config": {}
        };
        vegaEmbed("#"+where.id, spec, {mode: "vega-lite"});
    };
}