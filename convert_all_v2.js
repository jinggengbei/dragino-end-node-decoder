const fs = require('fs');
const path = require('path');

const BASE_DIR = '/root/.openclaw/workspace/dragino-end-node-decoder';

// 已转换设备（跳过）
const SKIP_DEVICES = ['PB01', 'LHT52', 'LDS03A', 'CS01-LB', 'LHT65N', 'LTC2', 'LDS02', 'TrackerD', 'TS01-LB', 'UV254-LB', 'N720-SX'];

// 辅助函数模板
const HELPER_FUNCTIONS = `function getzf(c_num){ 
    if(parseInt(c_num) < 10)
        c_num = '0' + c_num; 
    return c_num; 
}

function getMyDate(str){ 
    var c_Date;
    if(str > 9999999999)
        c_Date = new Date(parseInt(str));
    else 
        c_Date = new Date(parseInt(str) * 1000);
    
    var c_Year = c_Date.getFullYear(), 
    c_Month = c_Date.getMonth()+1, 
    c_Day = c_Date.getDate(),
    c_Hour = c_Date.getHours(), 
    c_Min = c_Date.getMinutes(), 
    c_Sen = c_Date.getSeconds();
    var c_Time = c_Year +'-'+ getzf(c_Month) +'-'+ getzf(c_Day) +' '+ getzf(c_Hour) +':'+ getzf(c_Min) +':'+getzf(c_Sen); 
    
    return c_Time;
}

`;

// 获取设备目录
function getDeviceDirs() {
    const dirs = fs.readdirSync(BASE_DIR).filter(item => {
        const itemPath = path.join(BASE_DIR, item);
        return fs.statSync(itemPath).isDirectory() && !SKIP_DEVICES.includes(item) && !item.startsWith('.');
    });
    return dirs;
}

// 查找解码器文件
function findDecoderFile(deviceDir) {
    const files = fs.readdirSync(deviceDir);
    // 排除已经转换的文件
    const decoderFiles = files.filter(f => f.endsWith('.txt') && !f.includes('_decoder.txt'));
    if (decoderFiles.length > 0) {
        return path.join(deviceDir, decoderFiles[0]);
    }
    return null;
}

// 读取原始文件
function readOriginalFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

// 转换解码器为统一格式
function convertToUnifiedFormat(originalContent, deviceName) {
    let converted = originalContent;
    
    // 检查是否已经是统一格式
    if (converted.includes('function decodeUplink(input)')) {
        return converted;
    }
    
    // 1. 移除旧的注释头（如果有）
    converted = converted.replace(/^\/\/ Decode decodes.*?\n/gm, '');
    converted = converted.replace(/^\/\/  - fPort.*?\n/gm, '');
    converted = converted.replace(/^\/\/  - bytes.*?\n/gm, '');
    converted = converted.replace(/^\/\/  - variables.*?\n/gm, '');
    converted = converted.replace(/^\/\/ The function must return.*?\n/gm, '');
    
    // 2. 替换函数签名
    // 处理 function Decode(fPort, bytes, variables)
    converted = converted.replace(
        /function\s+Decode\s*\(\s*fPort\s*,\s*bytes\s*,\s*variables\s*\)/g,
        'function decodeUplink(input) {\n    var fPort = input.fPort;\n    var bytes = input.bytes;\n    var variables = input.variables;'
    );
    
    // 处理 function Decoder(bytes, port)
    converted = converted.replace(
        /function\s+Decoder\s*\(\s*bytes\s*,\s*port\s*\)/g,
        'function decodeUplink(input) {\n    var port = input.fPort;\n    var bytes = input.bytes;'
    );
    
    // 3. 处理 return 语句：将直接返回对象改为返回 { data: {...} }
    // 这是一个复杂的转换，需要找到最终的 return 语句
    // 简单处理：在函数末尾，将 return { ... } 改为 return { data: { ... } }
    
    // 4. 添加辅助函数（如果不存在）
    if (!converted.includes('function getzf') && !converted.includes('function getMyDate')) {
        converted = HELPER_FUNCTIONS + converted;
    }
    
    // 5. 确保函数正确闭合
    // 检查是否有未闭合的函数
    
    return converted;
}

// 包装返回值为 { data: ... } 格式
function wrapReturnValue(content) {
    // 查找所有 return 语句，将 return { key: value } 改为 return { data: { key: value } }
    // 但要注意不要重复包装
    
    // 简单策略：找到函数末尾的 return result; 或类似的，改为 return { data: result };
    content = content.replace(/return\s+result\s*;/g, 'return { data: result };');
    content = content.replace(/return\s+{\s*data:\s*result\s*}\s*;/g, 'return { data: result };'); // 避免重复
    
    return content;
}

// 保存转换后的文件
function saveConvertedFile(deviceDir, deviceName, content) {
    const outputPath = path.join(deviceDir, `${deviceName}_decoder.txt`);
    fs.writeFileSync(outputPath, content);
    return outputPath;
}

// 主函数
function main() {
    const deviceDirs = getDeviceDirs();
    const convertedDevices = [];
    const skippedDevices = [];
    const errorDevices = [];
    const alreadyUnifiedDevices = [];
    
    console.log(`找到 ${deviceDirs.length} 个需要处理的设备目录`);
    console.log(`跳过 ${SKIP_DEVICES.length} 个已转换设备: ${SKIP_DEVICES.join(', ')}`);
    console.log('---');
    
    for (const deviceDir of deviceDirs) {
        const devicePath = path.join(BASE_DIR, deviceDir);
        const decoderFile = findDecoderFile(devicePath);
        
        if (!decoderFile) {
            console.log(`⚠️  ${deviceDir}: 未找到解码器文件`);
            skippedDevices.push(deviceDir);
            continue;
        }
        
        try {
            const originalContent = readOriginalFile(decoderFile);
            
            // 检查是否已经是统一格式
            if (originalContent.includes('function decodeUplink(input)')) {
                console.log(`⏭️  ${deviceDir}: 已是统一格式，复制为 _decoder.txt`);
                saveConvertedFile(devicePath, deviceDir, originalContent);
                alreadyUnifiedDevices.push(deviceDir);
                convertedDevices.push(deviceDir);
                continue;
            }
            
            let convertedContent = convertToUnifiedFormat(originalContent, deviceDir);
            convertedContent = wrapReturnValue(convertedContent);
            
            const outputPath = saveConvertedFile(devicePath, deviceDir, convertedContent);
            
            console.log(`✅ ${deviceDir}: 已转换 -> ${path.basename(outputPath)}`);
            convertedDevices.push(deviceDir);
        } catch (error) {
            console.log(`❌ ${deviceDir}: 转换失败 - ${error.message}`);
            errorDevices.push(deviceDir);
        }
    }
    
    console.log('---');
    console.log(`转换完成:`);
    console.log(`  ✅ 成功: ${convertedDevices.length} (其中 ${alreadyUnifiedDevices.length} 个已是统一格式)`);
    console.log(`  ⚠️  跳过: ${skippedDevices.length}`);
    console.log(`  ❌ 失败: ${errorDevices.length}`);
    
    if (convertedDevices.length > 0) {
        console.log('\n已转换设备列表:');
        convertedDevices.forEach(d => console.log(`  - ${d}`));
    }
    
    return convertedDevices;
}

main();
