const tempObj = document.getElementById("jsonArea");
const btn = document.getElementById("getKeysBtn");
const resultArea = document.getElementById("resultArea");
const keyWrapper = document.getElementById("keyWrapper");
const copyBtn = document.getElementById("copyTobuffBtn");
const radioBtns = document.querySelectorAll("input[name='wrappers']")
const wrappersList = document.getElementById("wrappersList");

let wrapperOfKey = {
    left:'"',
    right:'"'
}

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
    console.log(stringFromArray);
    return stringFromArray;

}

btn.addEventListener('click',()=>{
    const parsedObj = JSON.parse(tempObj.value);
    resultArea.value = getNestedKeys(parsedObj);
})

copyBtn.addEventListener('click',()=>{
    resultArea.select();
    document.execCommand('copy');
})

for(let i=0; radioBtns.length>i; i++){
    radioBtns[i].addEventListener('change',()=>onChangeRadioBtn(radioBtns[i]))
}

keyWrapper.addEventListener('change',(event)=>{
    wrapperOfKey = {
        left:event.target.value,
        right:event.target.value
    }
})

wrappersList.addEventListener('change',(event)=>{
    wrapperOfKey = {
        left:event.target.value.split(' ')[0],
        right:event.target.value.split(' ')[1]
    }
})

const onChangeRadioBtn = (radioBtn)=>{
    console.log(radioBtn.id)
    switch(radioBtn.id){
        case 'customWrappers':
            wrappersList.disabled = true;
            wrappersList.value = '1'

            keyWrapper.disabled = false;

            wrapperOfKey = {
                left:keyWrapper.value,
                right:keyWrapper.value
            };
        break;
        
        case 'SelectWrappers':
            wrappersList.disabled = false;
            keyWrapper.disabled = true;
            keyWrapper.value = ''
            wrapperOfKey = {
                left:wrappersList.value.split(' ')[0],
                right:wrappersList.value.split(' ')[1]
            };
        break;
    }
}

tempObj.addEventListener( 'input', autosize );
             
function autosize(){
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
}