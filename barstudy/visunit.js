function VisUnit(){

    let taskAccuracySum = 0; //used for gateway tasks

    /**
     --------------------------------------------------------------------
     starts a study(schedule); gui can be either a plain div (in which case
     the default VisUnit display layout is constructed) or as an object where
     individual divs are specified for each GUI element (question, answer, next...)
     saveData = callback function to save the data somw somewhere; VisUnit will call
     this whenever a participant finishes a task and send in two params: the
     participant response, and the task context
     **/
    this.startStudy = (gui, schedule, saveData = () => {}) => {
        if (gui instanceof HTMLDivElement){
            //empty div element; create default VisUnit gui structure inside it
            gui = createDefaultGUI(gui);
        }
        setupBlock(gui, saveData, schedule, 0, 0, (b,i) => {});
    }

    /**
     --------------------------------------------------------------------
     previews a task with the given viewer for the given data; by default
     all instances of the task are previewed; alternatively specific instances
     can be given (their data field needs to match data)
     **/
    this.previewTask  = (gui, task, viewer, data, specificInstances = null) => {
        let instances = specificInstances == null ?
            task.instances == null ? [] :
                task.instances.filter (i => i.data == data).map( i => i.instances).flat() :
            specificInstances;
        console.log("prev");
        console.log(data);
        let block = [ { type : "preview", task : task, viewer: viewer, dataset : data,
            instances : instances, duration : 10}];

        this.startStudy(gui, block);
    }


    /**
     --------------------------------------------------------------------
     WORKHORSE method: sets up a study block with everything associated: setting up the visual
     stimulus (viewer+dataset+task), returning and saving results, etc.
     **/
    function setupBlock(gui, saveData, schedule, blockIndex, instanceIndex = 0, advanceCallback) {

        clearGUI(gui);

        //if we start a new block then ...
        if (instanceIndex == 0)
            taskAccuracySum = 0;

        //if we reached the end -> finish
        if (blockIndex >= schedule.length){
            return;
        }

        let block = schedule[blockIndex];

        //set progress
        let completedDuration = scheduleDuration(schedule, blockIndex) + instanceIndex*block.duration;
        let totalDuration = scheduleDuration(schedule);
        let progress = Math.trunc(100 * completedDuration/totalDuration);

        if (block.exit == true)
            progress = 100;

        gui.progress.innerHTML = "(" + progress + "% done)";

        if (block.type == "eval_task" || block.type == "block_task" ||
            block.type == "train" || block.type == "bridge_task" ||
            block.type == "preview"){

            //set up EVAL blocks and get back a 'getResponse' method
            let getResponse = setupEvalBlock(gui, block,
                block.instances != undefined ?
                    block.instances[instanceIndex] : null);

            //if it's the first instance of a task, increasing saliency of task instruction
            //with a small animation
            if (instanceIndex == 0){
                d3.select(gui.question).transition().duration(300).style("background-color","rgba(0,0,0,0.15)");
                d3.select(gui.question).transition().delay(500).duration(500).style("background-color","rgba(0,0,0,0)");
            }

            if (block.type == "train"){
                d3.select(gui.train).transition().duration(300).style("background-color","rgba(0,0,0,0.15)");
                d3.select(gui.train).transition().delay(500).duration(500).style("background-color","rgba(0,0,0,0)");

                //enable training controls (checking accuracy, etc.)
                enableTrainingGUI(gui);
                gui.check.onclick = () => {
                    let response = getResponse();
                    gui.correctness.hidden = false;
                    gui.correctness.innerHTML = formatAccuracy(response.accuracy);
                    gui.next.disabled = false;
                }
            }  //end train

            if (block.type == "preview"){
                gui.check.hidden = false;
                gui.check.onclick = () => {
                    let response = getResponse();
                    gui.correctness.hidden = false;
                    gui.correctness.innerHTML = formatAccuracy(response.accuracy);
                }
            }


            //prepare what happens when use is done (clicks next)
            let startTime = (new Date()).getTime();
            gui.next.onclick = () => {
                let response = getResponse();
                response.time = ((new Date()).getTime() - startTime);

                if (block.type == "train"){
                    response.train = true;
                    disableTrainingGUI(gui);
                }

                if (block.type == "train" || block.type == "preview")
                    gui.correctness.hidden = true;

                //call provided call back to save responses
                saveData(response);

                if (response.accuracy > 0)
                    taskAccuracySum += response.accuracy;

                //if there are more instances of this task -> go to next instance
                if (block.instances != undefined && instanceIndex < block.instances.length-1){
                    advanceCallback(blockIndex, instanceIndex+1);
                    setupBlock(gui, saveData, schedule, blockIndex, instanceIndex+1, advanceCallback);
                }
                else {
                    //gateway tasks
                    if (block.min_accuracy && taskAccuracySum / block.instances.length < block.min_accuracy){
                        //exit study
                        let exitBlock = schedule.findIndex ( b => b.exit);
                        if (exitBlock < 0) exitBlock = schedule.length-1;
                        advanceCallback(exitBlock, 0);
                        setupBlock(gui, saveData, schedule, exitBlock, 0, advanceCallback);
                    } else
                    { //continue as normal
                        advanceCallback(blockIndex+1, 0);
                        setupBlock(gui, saveData, schedule, blockIndex+1, 0, advanceCallback);
                    }
                }
            }
        }
        else{  //unrecognised block, skip
            setupBlock(gui, saveData, schedule, blockIndex+1);
        }
    }

    /**
     --------------------------------------------------------------------
     helper method for setupBlock
     **/
    function setupEvalBlock(gui, block, instance){
        console.log("prepping eval block " + block + instance);

        let viewer = block.hide_viewer ? null : block.viewer;

        //change the data in the viewer if necessary
        if (viewer != null && viewer.getData() != block.dataset)
            viewer.loadData(block.dataset);


        //make sure the viewer is up to date
        gui.viewer.innerHTML = "";
        if (viewer != null) viewer.draw(gui.viewer);

        if (viewer != null)
            viewer.clearTask();

        //this is the context of this particular visualisation;
        //it's passed into the accuracy function (and anywhere else?)
        let context = {
            viewer : viewer,
            data : block.dataset,
            task : block.task,
            task_instance : instance,
            gui : gui
        }





        //create gui outputs/answer options
        gui.answer.innerHTML = "";
        for (let k=0; k<block.task.outputs.length; k++){
            if (block.task.outputs[k].type == "select"){
                let html = "<select id='" + gui.answer + "_select'>";
                for (let i=0; i<block.task.outputs[k].options.length; i++)
                    html += "<option value='" + block.task.outputs[k].options[i] + "'>" +
                        block.task.outputs[k].options[i] + "</option>";
                html += "</select>";
                gui.answer.innerHTML  = html;
            }
            else if (block.task.outputs[k].type == "short text"){
                let html = "<input type='text' id='" + gui.answer + "_text'>";
                gui.answer.innerHTML = html;
            }
        }

        //task question: will be expanded/filled-in with inputs
        let question = block.task.question;
        //set the in_text inputs first
        for (let k=0; block.task.inputs != undefined &&  k<block.task.inputs.length; k++)
            if (block.task.inputs[k].type[0] === "in_text")
                question = question.replace("$"+k, instance.inputs[k]);
        //set the (perhaps expanded) question text in the gui
        gui.question.innerHTML = question;

        //set the in_vis inputs; we do a little hack here and always send in
        //the gui.question div too - this lets the vis override a question
        for (let k=0; block.task.inputs != undefined &&  k<block.task.inputs.length; k++){
            if (block.viewer != null && block.task.inputs[k].type[0] === "in_vis")
                eval("viewer.set"+ block.task.inputs[k].type[1] + "(instance.inputs[k],context)");
        }



        //get the outputs and call the task's accuracy function with them
        let getResponse = () => {
            let outputs = [];
            for (let k=0; k<block.task.outputs.length; k++)
                if (block.task.outputs[k].type === "in_vis")
                    if (block.viewer != null)
                        outputs.push(eval("viewer.get"+ block.task.outputs[k].method + "()"));
                    else outputs.push("error: viewer is null");
                else if (block.task.outputs[k].type === "select"){
                    let div = document.getElementById(gui.answer+"_select");
                    outputs.push(div.value);
                }
                else if (block.task.outputs[k].type == "short text"){
                    let div = document.getElementById(gui.answer+"_text");
                    outputs.push(div.value);
                }
            return {
                response : outputs,
                accuracy : instance != null ? instance.accuracy(outputs, context) :
                    (block.task.accuracy != undefined ? block.task.accuracy(outputs, context) : -1)
            }
        }
        return getResponse;
    }


    function createDefaultGUI(gui){
        gui.innerHTML = "";
        gui.style = "background-color : rgb(245,250,255)";
        let tbl = document.createElement('table');
        gui.appendChild(tbl);
        let r1 = tbl.insertRow();
        let cell = r1.insertCell();
        let next = document.createElement("button");
        next.appendChild(document.createTextNode("Next"));
        cell.appendChild(next);
        let progress = document.createElement("span");
        progress.style = "color : #888888";
        progress.innerHTML = "(0% done)";
        cell.appendChild(progress);
        cell = r1.insertCell();
        let checkAnswer = document.createElement("button");
        //checkAnswer.setAttribute("type", "button");
        checkAnswer.appendChild(document.createTextNode("Check answer"));
        checkAnswer.setAttribute("hidden",true);
        cell.appendChild(checkAnswer);
        let correctness = document.createElement("span");
        cell.appendChild(correctness);

        let r2 = tbl.insertRow();
        cell = r2.insertCell();
        let train = document.createElement("div");
        train.style = "color:#883300";
        train.setAttribute("hidden", true);
        train.innerHTML = "This is <span style=\"font-weight : bold\">practice</span>; check your answer before advancing; actual questions follow.";
        cell.appendChild(train);
        let question = document.createElement("div");
        cell.appendChild(question);
        cell = r2.insertCell();
        let answer = document.createElement("div");
        cell.appendChild(answer);

        let viewer = document.createElement("div");
        viewer.setAttribute("id", gui.getAttribute("id") + "_viewer");
        gui.appendChild(viewer);

        return {
            question : question,
            answer : answer,
            next : next,
            check : checkAnswer,
            correctness : correctness,
            progress : progress,
            train : train,
            viewer : viewer
        };
    }

    function clearGUI(gui){
        gui.question.innerHTML = "";
        gui.answer.innerHTML = "";
        gui.correctness.innerHTML = "";
        gui.correctness.hidden = true;
    }

    //helper: takes a number btw 0..1 and converts it to a string
    function formatAccuracy(accuracyNumber){
        if (accuracyNumber > 1) accuracyNumber = 1;
        if (accuracyNumber < 0) accuracyNumber = 0;

        if (accuracyNumber == 1) return "Correct";
        else if (accuracyNumber == 0) return "Incorrect";
        else return parseFloat(accuracyNumber*100).toPrecision(2) + "% Correct";
    }

    function disableTrainingGUI(gui){
        gui.check.hidden = true;
        gui.correctness.hidden = true;
        gui.train.hidden = true;
    }
    function enableTrainingGUI(gui){
        gui.train.hidden = false;
        gui.next.disabled = true;
        gui.check.hidden = false;
    }

    /**
     --------------------------------------------------------------------
     provides some default values when study options are left unspecified
     **/
    function expandDesignDefaults(design){

        //study
        if (typeof design.blocking == "undefined") design.blocking = "vtd";
        if (typeof design.block_tasks == "undefined") design.block_tasks = [];

        //viewers
        if (typeof design.viewers.how == "undefined") design.viewers.how = "within";

        //datasets
        if (typeof design.datasets.how == "undefined") design.datasets.how = "within";

        //tasks
        if (typeof design.tasks.how == "undefined") design.tasks.how = "within";
        for (let i = 0; i<design.tasks.which.length; i++){
            let t = design.tasks.which[i];

            if (typeof t.task == "undefined"){
                t = { task : t}
                design.tasks.which.splice(i,1,t);
            }
            if (typeof t.repeats == "undefined") t.repeats = { number : 1, random : false, unique : true }
            if (typeof t.repeats != "object") t.repeats = { number : t.repeats, random : false, unique : true }
            if (typeof t.repeats.random == "undefined") t.repeats.random = false;
            if (typeof t.repeats.unique == "undefined") t.repeats.unique = true;
            if (typeof t.train != "undefined"){
                if (typeof t.train != "object") t.train = { repeats : t.train, with : "v", when : "first showing"};
                if (typeof t.train.with == "undefined") t.train.with = "v";
                if (typeof t.train.when == "undefined") t.train.when = "first showing";
                if (typeof t.train.repeats == "undefined") t.train.repeats = 1;
            }
            if (typeof t.estimated_duration == "undefined") t.estimated_duration = 30;
        }
    }



    /** some basic default tasks **/
    function HTMLViewer() {
        let data = null;
        this.loadData = (d) => data = d;
        this.getData = () => data;
        this.clearTask = () => {};
        this.draw = (div) => div.innerHTML = data != null ? data.content : "";
    }
    this.tasks = new Object();

    this.tasks.showHTML = (html) => {
        let ret = {
            task : { name : "html", question : "",
                description : "show html content", inputs :  [], outputs : [], instances : []},
            viewer : new HTMLViewer(),
            dataset : { name : "html", description : "html content", content : html},
            showBefore : (b) => { ret.show = "before"; ret.block = b; return ret},
            showAfter : (b) => { ret.show = "after"; ret.block = b; return ret},
            exit : () => {ret.exit = true; return ret}};
        return ret;
    }


    /**
     --------------------------------------------------------------------
     adds up study(schedule) duration; by default does it for the entire study
     but second parameter can indicate how much of the schedule is considered
     **/
    function scheduleDuration(schedule, upTo = schedule.length){
        let duration = 0;
        for (let i=0; i< upTo; i++){
            let block = schedule[i];
            let nrInstances = typeof block.instances == "undefined" ? 1 : block.instances.length;
            duration += nrInstances*block.duration;
        }
        return duration;
    }




    this.addBlockTasks = (design, schedule, allBlockTasks) => {
        let seq = ["dataset", "task", "viewer", "study"];
        seq.reverse();

        for (let i=0; i<seq.length; i++){
            let factor = seq[i];

            //get block tasks that start with the factor (d,t,v,s)
            let blockTasks = allBlockTasks.filter( bt => bt.block.startsWith(factor[0]));
            blockTasks.reverse();

            for (let j=0; j<blockTasks.length; j++){

                let t = allBlockTasks.findIndex( t => t == blockTasks[j]);

                let bt = blockTasks[j];

                let blocks = []; //an array of arrays
                if (bt.block.endsWith("*") || factor == "study"){
                    blocks.push(this.getBlocks(schedule, factor, "*"));
                }
                else
                    for (let k=0; k<design[factor+"s"].which.length; k++)
                        blocks.push(this.getBlocks(schedule, factor, k));

                blocks = blocks.filter( b => b.length != 0);



                for (let k=0; k<blocks.length; k++){


                    if (bt.show == "before first"){ //we insert before first block
                        let insertionPoint = schedule.findIndex( b => b == blocks[k][0].start);
                        schedule.splice(insertionPoint,0,{type : "block_task",
                            task : t,
                            viewer : blocks[k][0].start.viewer,
                            dataset : blocks[k][0].start.dataset});
                    }
                    else if (bt.show == "before" || bt.show == "before each" || bt.show == "between"){ //we insert before each block

                        for (let z = 0; z<blocks[k].length; z++){
                            if (bt.show == "between" && z == 0) continue;
                            let insertionPoint = schedule.findIndex( b => b == blocks[k][z].start);
                            schedule.splice(insertionPoint,0,{type : "block_task",
                                task : t,
                                viewer : blocks[k][z].start.viewer,
                                dataset : blocks[k][z].start.dataset});
                        }
                    }
                    else if (bt.show == "after last"){ //we insert after last block
                        let insertionPoint = schedule.findIndex( b => b == blocks[k][blocks[k].length-1].end)+1;
                        schedule.splice(insertionPoint,0,{type : "block_task",
                            task : t,
                            viewer : blocks[k][blocks[k].length-1].end.viewer,
                            dataset : blocks[k][blocks[k].length-1].end.dataset});
                    }
                    else if (bt.show == "after" || bt.show == "after each"){ //we insert after each block
                        for (let z = 0; z<blocks[k].length; z++){
                            let insertionPoint = schedule.findIndex( b => b == blocks[k][z].end)+1;
                            schedule.splice(insertionPoint,0,{type : "block_task",
                                task : t,
                                viewer : blocks[k][z].end.viewer,
                                dataset : blocks[k][z].end.dataset});
                        }
                    }

                }

            }
        }
    }

    this.getBlocks = (schedule, factor, level) => {

        if (factor == "study")
            return [{start : schedule[0], end : schedule[schedule.length-1]}];

        let ret = [];
        let currentBlock = {start : 0, end : -1};
        for (let i=0; i<schedule.length; i++){

            if (i == schedule.length-1){
                currentBlock.end = i;
                if (schedule[i].type == "eval_task" && (level == "*" || schedule[i][factor] == level))
                    ret.push(currentBlock);
            }

            if (i < schedule.length - 1 &&
                (schedule[i].type != schedule[i+1].type || schedule[i][factor] != schedule[i+1][factor])){
                currentBlock.end = i;
                if (schedule[i].type == "eval_task" && (level == "*" || schedule[i][factor] == level))
                    ret.push(currentBlock);
                currentBlock = {start : i+1, end : -1};
            }
        }

        return ret.map( b => ({start : schedule[b.start], end : schedule[b.end]}));
    }









    //MAIN PUBLIC FUNCTION
    //given a declarative study design, create study 'schedules' (or flows),
    //one for each participant group
    this.createStudySchedules = (design) => {

        expandDesignDefaults(design);

        //the 'schedules' are created and fleshed out in multiple steps:

        //FIRST, put together the schedules for the main testing part based of
        //the design (within/between..) and blocking orders; these won't include training tasks,
        //vis introductions, pre or post questionnaires; they also won't include task instances
        //viewers/datasets/and tasks are at this point refered by indeces in the viewer/dataset/task
        //arrays (e.g, design.viewers.which[index])
        let schedules = createBlock(design.blocking, design);
        //  return schedules;  //if you want to see what the above produced.


        schedules.map( s => this.addBlockTasks(design, s, design.block_tasks));

        //SECOND, we add task training blocks
        schedules.map( s => addTraining(s, design));
        //return schedules; //if you want to see what the above produced.


        //THIRD, we add task instance information to eval and train blocks
        schedules.map( s => assignInstances(s));
        //return schedules; //if you want to see what the above produced.

        //FOURTH, fill the actual viewer and task objects instead of their indeces;
        //do a little more for tasks
        for (let i=0; i<schedules.length; i++){
            for (let j=0; j<schedules[i].length; j++){
                let block = schedules[i][j];

                if (block.type  == "eval_task" || block.type == "block_task"){

                    let task = block.type == "eval_task" ?
                        design.tasks.which[block.task] : design.block_tasks[block.task];
                    block.dataset =  typeof task.dataset != "undefined" ?
                        task.dataset : design.datasets.which[block.dataset];
                    block.viewer = typeof task.viewer != "undefined" ?
                        task.viewer : design.viewers.which[block.viewer];

                    //assemble the task in the right way: the task should contain the
                    //prototype + only the instances needed for this schedule item

                    //copy the task over from design
                    block.duration  =  task.estimated_duration != undefined ? task.estimated_duration :
                        (task.max_time != undefined ? task.max_time :
                            (design.default_duration ? design.default_duration : 30 ))

                    if (task.min_accuracy)
                        block.min_accuracy = task.min_accuracy;
                    if (task.exit)
                        block.exit = task.exit;

                    if (task.bridging) block.type = "bridge_task";

                    block.hide_viewer =   typeof task.hide_viewer == "undefined" ? false : task.hide_viewer;

                    block.task = {...task.task};

                    if (block.viewer == null) block.dataset = null;
                }
            }
        }

        //if exit task doesn't exist, add a default one
        for (let i=0; i<schedules.length; i++)
            if (schedules[i].findIndex( b => b.exit) < 0)
                schedules[i].push({
                    type : "block_task",
                    exit : true,
                    viewer : null,
                    dataset : null,
                    task : {
                        name : "default exit",
                        description : "A default VisUnit exit message",
                        question : "This concludes the study. Thank you for participating.",
                        inputs : [],
                        outputs : []
                    },
                    duration : 5
                });

        return schedules;

        //Finally, order schedules by duration (so that similar schedules are grouped together
        // (this make it easier to display them in the StudyViewer)
        let newSchedules = [];
        let timelines = schedules.map( s=>createTimeline(s));
        for (let i=0; i<schedules.length; i++){
            newSchedules.push(schedules[i]);
            for (let j=i+1; j<schedules.length; j++)
                if (sameTimelines(timelines[i],timelines[j])){
                    newSchedules.push(schedules[j]);
                    schedules.splice(j,1); timelines.splice(j,1);
                    j--;
                }
        }

        return newSchedules;

        //private function: creates schedules recursively by building them up
        //from the blocking and design information   //tvd
        function createBlock(blocking, design){

            // d => d1, d2, d3
            // v => iv v1d1 v1d2 v1d3 rv
            //      iv v2d1 v2d2 v2d3 rv
            // t => iv t1v1d1 t1v1d2 t1v1d3 rv iv t2v1d1 t2v1d2 t2v1d3 rv

            //stopping condition, return empty schedule list
            if (blocking === "")
                return [[{type : "eval_task"}]];


            //get the schedule for the 'tail' of the blocking string
            //then add components corresponding to the 'head' of the
            //blocking string to it.
            let subSchedules = createBlock(blocking.substr(1), design);

            let schedules = null;
            if (blocking[0] == 'v')
                schedules =  addToSchedules(subSchedules, 'viewer',
                    design.viewers.which, design.viewers.how, design.block_tasks);
            else if (blocking[0] == 'd')
                schedules = addToSchedules(subSchedules, 'dataset',
                    design.datasets.which, design.datasets.how, design.block_tasks);
            else if (blocking[0] == 't')
                schedules = addToSchedules(subSchedules, 'task',
                    design.tasks.which, design.tasks.how, design.block_tasks);
            return schedules;

        }

        //private function: ...
        function addToSchedules(schedules, factorName, levels, design, allBlockTasks){

            //first, check if there are block tasks for this factor
            let getBlockTasks = (show) => [];
            /*   allBlockTasks.map ( (t,index) => index).
                     filter( (ti => allBlockTasks[ti].block.startsWith(""+factorName[0]) &&
                                    show.findIndex( s => s == allBlockTasks[ti].show) >= 0));*/

            let newSchedules = [];

            if (design === 'between'){
                for (let i=0; i<levels.length; i++){
                    for (let j=0; j<schedules.length; j++){
                        let schedule = addFactor(schedules[j], factorName, i);
                        getBlockTasks(["before","before each","before first","before last"])
                            .map( (t,index) => schedule.splice(index,0,{type : "block_task",
                                task : t,
                                viewer : schedule[index].viewer,
                                dataset : schedule[index].dataset}));
                        getBlockTasks(["after","after each","after first", "after last"])
                            .map( (t,index) => schedule.push({  type : "block_task",
                                task : t,
                                viewer : schedule[schedule.length-1].viewer,
                                dataset : schedule[schedule.length-1].dataset}));
                        newSchedules.push(schedule);
                    }
                }
            }
            else if (design == 'within'){
                for (let i = 0; i<schedules.length; i++){
                    let newSchedule = [];
                    for (let j=0; j<levels.length; j++){
                        let schedule = addFactor(schedules[i], factorName, j);

                        let preBlocks = [];
                        if (j == 0) preBlocks = getBlockTasks(["before", "before first", "before each"]);
                        else if (j == levels.length-1)
                            preBlocks = getBlockTasks(["before", "before last", "before each"]);
                        else preBlocks = getBlockTasks(["before", "before each","between"]);

                        preBlocks.map( (t,index) => schedule.splice(index,0,{type : "block_task",
                            task : t,
                            viewer : schedule[index].viewer,
                            dataset : schedule[index].dataset}));

                        let postBlocks = [];
                        if (j == 0) postBlocks = getBlockTasks(["after", "after first", "after each","between"]);
                        else if (j == levels.length-1)
                            postBlocks = getBlockTasks(["after", "after last", "after each"]);
                        else postBlocks = getBlockTasks(["after", "after each"]);
                        postBlocks.map( (t,index) => schedule.push({type : "block_task",
                            task : t,
                            viewer : schedule[schedule.length-1].viewer,
                            dataset : schedule[schedule.length-1].dataset}));
                        newSchedule = newSchedule.concat(schedule);
                    }
                    newSchedules.push(newSchedule);
                }
            }
            else if (design == 'within-fully-counterbalanced' || design == 'within-latin-counterbalanced'){
                let ordering = design == 'within-fully-counterbalanced' ?
                    getFullCounterBalanceOrder(levels.length) :
                    getLatinSquare(levels.length);
                for (let k=0; k<ordering.length; k++){
                    for (let i = 0; i<schedules.length; i++){
                        let newSchedule = [];
                        for (let j=0; j<ordering[k].length; j++){
                            let schedule = addFactor(schedules[i], factorName, ordering[k][j]-1);

                            let preBlocks = [];
                            if (j == 0) preBlocks = getBlockTasks(["before", "before first", "before each"]);
                            else if (j == levels.length-1) preBlocks = getBlockTasks(["before","before last","before each"]);
                            else preBlocks = getBlockTasks(["before", "before each","between"]);
                            preBlocks.map( (t,index) => schedule.splice(index,0,{type : "block_task",
                                task : t,
                                viewer : schedule[index].viewer,
                                dataset : schedule[index].dataset}));
                            let postBlocks = [];
                            if (j == 0) postBlocks = getBlockTasks(["after", "after first", "after each","between"]);
                            else if (j == levels.length-1) postBlocks = getBlockTasks(["after", "after last", "after each"]);
                            else postBlocks = getBlockTasks(["after", "after each"]);
                            postBlocks.map( (t,index) => schedule.push({task : t,
                                type : "block_task",
                                viewer : schedule[schedule.length-1].viewer,
                                dataset : schedule[schedule.length-1].dataset}));
                            newSchedule = newSchedule.concat(schedule);
                        }
                        newSchedules.push(newSchedule);
                    }
                }
            }
            else{
                //console.log("error in studyschedules.js: unrecognized design " + design);
                return null;
            }
            return newSchedules;
        }

        //simply adds a factor=level element to each item
        //on a schedule
        function addFactor(schedule, factorName, level){
            //copy the schedule
            let newSchedule = JSON.parse(JSON.stringify(schedule));
            //append the factor to the schedule
            for (let i=0; i<newSchedule.length; i++){
                let scheduleItem = newSchedule[i];
                if (scheduleItem.type != "block_tasks" &&
                    typeof scheduleItem[factorName] == "undefined")
                    scheduleItem[factorName] = level;
            }
            return newSchedule;
        }

        function addTraining(s, design){

            let evalBlocks = s.filter( block => block.type == "eval_task");


            //get all tasks in schedule in order
            let allT = evalBlocks.map(block => block.task);
            let tasks = allT.filter( (block,index) => index == allT.findIndex( block2 => block2 == block));

            //get all viewers in schedule in order
            let allV = evalBlocks.map(block => block.viewer);
            let viewers = allV.filter( (block,index) => index == allV.findIndex( block2 => block2 == block));

            //get all datasets in schedule in order
            let allD = evalBlocks.map(block => block.dataset);
            let datasets = allD.filter( (block,index) => index == allD.findIndex( block2 => block2 == block));

            //get all v*d combinations in ordre
            let allVD = evalBlocks.map(block => [block.viewer, block.dataset]);
            let vd = allVD.filter( (block,index) => index == allVD.findIndex( block2 =>
                block2[0]==block[0] && block2[1]==block[1]));

            for (let ti = 0; ti < tasks.length; ti++){
                let t = design.tasks.which[tasks[ti]];

                if (typeof t.train == "undefined") continue; //no training needed


                let trains = t.train;
                if (!(trains instanceof Array)) trains = [trains];

                for (let k=0; k<trains.length; k++){
                    let train = trains[k];

                    let what = train.with === undefined ? "v" : train.with;
                    let when = train.when === undefined ? "first showing" : train.when;

                    let trainBlocks = [];
                    if (what == "v")
                        viewers.map( v => trainBlocks.push(
                            s.findIndex( b => b.type == "eval_task" && b.task == tasks[ti] && b.viewer == v)));
                    else if (what == "d")
                        datasets.map( d => trainBlocks.push(
                            s.findIndex( b => b.type == "eval_task" && b.task == tasks[ti] && b.dataset == d)));
                    else if (what == "vd" || what == "dv")
                        vd.map( vd2 => trainBlocks.push(
                            s.findIndex( b => b.type == "eval_task" && b.task == tasks[ti] &&
                                b.viewer == vd2[0] && b.dataset == vd2[1])));

                    trainBlocks = trainBlocks.filter( tb => tb >= 0);



                    //we have the blocks that need to be trained
                    for (let i=0; i<trainBlocks.length; i++){
                        let newTrainingBlock = {
                            type : "train",
                            viewer : train.viewer != undefined ? train.viewer :
                                design.viewers.which[s[trainBlocks[i]].viewer],
                            dataset : train.dataset != undefined ? train.dataset :
                                design.datasets.which[s[trainBlocks[i]].dataset],
                            task : t.task,
                            repeats : train.repeats,
                            duration : t.estimated_duration != undefined ? t.estimated_duration :
                                (t.max_time != undefined ? t.max_time :
                                    (design.default_duration ? design.default_duration : 30 )),
                            study_view : typeof t.study_view == "undefined" ? true : t.study_view,
                            hide_viewer :   typeof t.hide_viewer == "undefined" ? false : t.hide_viewer }
                        if (when == "first showing"){
                            trainBlocks = trainBlocks.map( tb => tb <= trainBlocks[i] ? tb : tb + 1);
                            s.splice(trainBlocks[i],0,newTrainingBlock);
                        }
                        else if (when == "study start"){
                            trainBlocks = trainBlocks.map( tb => tb <= i ? tb : tb + 1);
                            s.splice(i,0, newTrainingBlock);
                        }
                    }
                }
            }
        }


        //private function: once the sequence of viewer x data x task conditions
        //for this study schedule (param: schedule) was established, we need to fill
        // in the task repeat information, i.e. expand each generic tasks with the
        // apropriate number of task repeats. Task repeats are selected from
        //allInstances
        function assignInstances(schedule){

            //for "eval" and "train" blocks, block.task is an index to a prototypical
            //task (no repeats/instances). We want to expand this into an appropriate list of
            //taskInstances based on how many repeats the study design demands

            //only certain blocks need repeats:
            let needsRepeats = (block) =>
                (block.type == "train" && block.repeats != undefined && block.task.inputs != undefined) ||
                (block.type == "eval_task" && design.tasks.which[block.task].repeats != undefined &&
                    design.tasks.which[block.task].task.inputs != undefined) ||
                (block.type == "block_task" && design.block_tasks[block.task].repeats != undefined &&
                    design.block_tasks[block.task].task.inputs != undefined)


            //init instances as empty lists; will fill them up after
            //only need instances for tasks with repeats
            for (let i=0; i<schedule.length; i++)
                if (needsRepeats(schedule[i]))
                    schedule[i].instances = [];

            let usedRepeats = [];


            //first do eval and block tasks; leave train for after
            for (let i=0; i<schedule.length; i++){

                let block = schedule[i];

                if (block.type == "train" || !needsRepeats(block))
                    continue;

                let task =  block.type == "eval_task" ? design.tasks.which[block.task] : design.block_tasks[block.task];
                let data = task.dataset == undefined ? design.datasets.which[block.dataset] : task.dataset;

                //we use this when 'unique' repeat selection is needed;
                //we also keep track of which instances we used for eval since we
                //can't use them for train. tdUsedRepeats are used locally in this
                //task x dataset loop and are 'saved' in usedRepeats for outside use
                let tdUsedRepeats = [];
                let urIndex = usedRepeats.findIndex( ur => ur[0] == task && ur[1] == data);
                if (urIndex >= 0) tdUsedRepeats = usedRepeats[urIndex][2];
                else  usedRepeats.push([task, data, tdUsedRepeats]);

                let instancesForData = task.task.instances.find(inst=>inst.data==data);

                //no instances for this combination of taskxdata combination
                if (instancesForData == undefined){
                    for (let r = 0; r<task.repeats.number; r++)
                        schedule[i].instances.push("unavailable - no instances");
                    continue;
                }

                let availableInstances = [...instancesForData.instances];
                if (task.repeats.random) d3.shuffle(availableInstances);

                for (let r=0; r < task.repeats.number; r++){

                    let found = false;
                    for (let k = r; k<availableInstances.length; k++)
                        if (!task.repeats.unique || //don't need to be unique, just pick this/next available one
                            tdUsedRepeats.findIndex(  //needs to be unique, check not used
                                ur => ur == availableInstances[k]) < 0){
                            tdUsedRepeats.push(availableInstances[k]);
                            block.instances.push(availableInstances[k]);
                            found = true;  break;
                        }
                    if (!found)
                        block.instances.push("unavailable - insufficient instances");
                }
            }

            for (let i = 0; i <schedule.length; i++){

                let block = schedule[i];

                if (block.type != "train" || !needsRepeats(block)) continue;

                let task = block.task;
                let data = block.dataset;
                let instancesForData = task.instances.find(inst=>inst.data==data).instances;

                for (let k=0; k<instancesForData.length; k++){
                    if (block.instances.length == block.repeats)
                        break;

                    let used = false;
                    for (let l=0; l<usedRepeats.length; l++){
                        if (usedRepeats[l][0].task.name === task.name && usedRepeats[l][1] == data &&
                            usedRepeats[l][2].findIndex( r => r == instancesForData[k]) >= 0){
                            used = true;
                            break;
                        }
                    }
                    if (!used && block.instances.length < block.repeats)
                        block.instances.push(instancesForData[k])
                }

                while (block.instances.length < block.repeats)
                    block.instances.push("not enough instances");
            }
        }



        //private function: returns a latin square of given order
        function getLatinSquare(order){
            if (order == 1)
                return [[1]];
            else if (order == 2)
                return [[1,2],
                    [2,1]];
            else if (order == 3)
                return [[1,2,3],
                    [2,3,1],
                    [3,1,2]];
            else if (order == 4)
                return [[1,2,3,4],
                    [2,4,1,3],
                    [3,1,4,2],
                    [4,3,2,1]];
            else if (order == 5)
                return [[1,2,3,4,5],
                    [2,4,1,5,3],
                    [3,5,4,2,1],
                    [4,1,5,3,2],
                    [5,3,2,1,4]]
            else
                return null;

        }

        //private function: gets full counter balanced matrix
        function getFullCounterBalanceOrder(order){
            if (order == 1)
                return [[1]];
            else if (order == 2)
                return [[1,2],
                    [2,1]];
            else if (order == 3)
                return [[1,2,3],
                    [1,3,2],
                    [2,1,3],
                    [2,3,1],
                    [3,1,2],
                    [3,2,1]];
            else if (order == 4)
                return [[1,2,3,4],
                    [1,2,4,3],
                    [1,3,2,4],
                    [1,3,4,2],
                    [1,4,2,3],
                    [1,4,3,2],
                    [2,1,3,4],
                    [2,1,4,3],
                    [2,3,1,4],
                    [2,3,4,1],
                    [2,4,1,3],
                    [2,4,3,1],
                    [3,1,2,4],
                    [3,1,4,2],
                    [3,2,1,4],
                    [3,2,4,1],
                    [3,4,1,2],
                    [3,4,2,1],
                    [4,1,2,3],
                    [4,1,3,2],
                    [4,2,1,3],
                    [4,2,3,1],
                    [4,3,1,2],
                    [4,3,2,1]];
            else
                return null;
        }
    }

}

function createTimeline(schedule, showBridges = true){
    let ret = [[0,0]];
    let t = 0;
    let x = 0;
    for (let i=0; i<schedule.length; i++){

        let block = schedule[i];
        let nrInstances = block.instances != undefined ? block.instances.length : 1;

        x = x+ (schedule[i].type == "bridge_task" ? (showBridges ? 0.5 : 0) : 1);
        t= t + block.duration * nrInstances;

        if (!showBridges && schedule[i].type == "bridge_task") continue;
        ret.push([x,t]);
    }
    return ret;
}

