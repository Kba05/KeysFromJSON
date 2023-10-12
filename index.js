// areas with data
const jsonTextArea = document.getElementById("jsonArea");
const resultArea = document.getElementById("resultArea");
// btns
const copyBtn = document.getElementById("copyTobuffBtn");
const btnGetKeys = document.getElementById("getKeysBtn");
const clearAreas = document.getElementById("clearAreas");
// wrappers
const customKeyWrapper = document.getElementById("customKeyWrapper");
const wrappersList = document.getElementById("wrappersList");
// radio btn
const radioBtns = document.querySelectorAll("input[name='wrappers']")
const radioCustomWrappers = document.getElementById("radioCustomWrappers");
const radioSelectWrappers = document.getElementById("radioSelectWrappers");
// variable for wrapping keys
let wrapperOfKey = {
    left:wrappersList.value.split(' ')[0],
    right:wrappersList.value.split(' ')[1]
}

// manage json
function getNestedKeys(obj) {
    let keys = [];

    for (let key in obj) {
        if (typeof obj[key] === "object" && obj[key] !== null) {
            if (Array.isArray(obj[key])) {
                obj[key].forEach(item => {
                    keys = keys.concat(getNestedKeys(item));
                });
            } else {
                keys = keys.concat(getNestedKeys(obj[key]));
            }
        }
        const tempKeyStr = `${wrapperOfKey.left}${key}${wrapperOfKey.right}`
        keys.push(tempKeyStr.trim());
    }
    const newSet = new Set(keys);
    const uniquekeys = Array.from(newSet);
    const stringFromArray = uniquekeys.join(', \n');
    return stringFromArray;

}

// autosizing textarea
function autosize(){
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
}

// button handlers
// handler for btn "Get keys"
btnGetKeys.addEventListener('click',()=>{
    const parsedObj = JSON.parse(jsonTextArea.value);
    resultArea.value = getNestedKeys(parsedObj);
    // autosize jsonTextArea
    autosize.apply(resultArea);
})

// handler for btn "Copy to buffer"
copyBtn.addEventListener('click',()=>{
    resultArea.select();
    document.execCommand('copy');
})

// handler for react to change customKeyWrapper radio btn value
radioCustomWrappers.addEventListener('change',()=>{
    wrappersList.disabled = true;
    wrappersList.value = '" "'
    customKeyWrapper.disabled = false;
    wrapperOfKey = {
        left:customKeyWrapper.value,
        right:customKeyWrapper.value
    };
})

// handler for react to change selector radio btn value
radioSelectWrappers.addEventListener('change',()=>{
    wrappersList.disabled = false;
    customKeyWrapper.disabled = true;
    customKeyWrapper.value = ''
    wrapperOfKey = {
        left:wrappersList.value.split(' ')[0],
        right:wrappersList.value.split(' ')[1]
    };
})

// handler for react to change value of customKeyWrapper
customKeyWrapper.addEventListener('change',(event)=>{
    wrapperOfKey = {
        left:event.target.value,
        right:event.target.value
    }
})

// handler for react to change value of wrappersList
wrappersList.addEventListener('change',(event)=>{
    wrapperOfKey = {
        left:event.target.value.split(' ')[0],
        right:event.target.value.split(' ')[1]
    }
})

// autosize jsonTextArea
jsonTextArea.addEventListener( 'input', autosize );
           
// clearArea
clearAreas.addEventListener('click',()=>{
    jsonTextArea.value = '';
    resultArea.value = '';
})