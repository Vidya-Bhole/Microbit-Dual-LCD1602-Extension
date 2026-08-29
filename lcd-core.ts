const enum LcdBacklight {
    //% block="off"
    Off = 0,

    //% block="on"
    On = 8
}

const enum TextAlignment {
    //% block="left-aligned"
    Left,

    //% block="right-aligned"
    Right,

    //% block="center-aligned"
    Center
}

const enum TextOption {
    //% block="align left"
    AlignLeft,

    //% block="align right"
    AlignRight,

    //% block="align center"
    AlignCenter,

    //% block="pad with zeros"
    PadWithZeros
}

const enum LcdChar {
    //% block="1"
    c1 = 0,

    //% block="2"
    c2 = 1,

    //% block="3"
    c3 = 2,

    //% block="4"
    c4 = 3,

    //% block="5"
    c5 = 4,

    //% block="6"
    c6 = 5,

    //% block="7"
    c7 = 6,

    //% block="8"
    c8 = 7
}

namespace makerbit {

    const enum Lcd {
        Command = 0,
        Data = 1
    }

    interface LcdState {
        i2cAddress: number
        backlight: LcdBacklight
        characters: Buffer
        rows: number
        columns: number
        rowNeedsUpdate: number
        refreshIntervalId: number
        sendBuffer: Buffer
        connected: boolean
    }

    // =========================================================
    // TWO INDEPENDENT LCD STATES
    // =========================================================

    let lcd1State: LcdState = undefined
    let lcd2State: LcdState = undefined

    // =========================================================
    // LOW LEVEL I2C
    // =========================================================

    function write4bits(
        i2cAddress: number,
        value: number,
        threeBytesBuffer: Buffer
    ): void {

        threeBytesBuffer.setNumber(
            NumberFormat.Int8LE,
            0,
            value
        )

        threeBytesBuffer.setNumber(
            NumberFormat.Int8LE,
            1,
            value | 0x04
        )

        threeBytesBuffer.setNumber(
            NumberFormat.Int8LE,
            2,
            value & (0xff ^ 0x04)
        )

        pins.i2cWriteBuffer(
            i2cAddress,
            threeBytesBuffer
        )
    }

    function send(
        lcdState: LcdState,
        RS_bit: number,
        payload: number
    ): void {

        if (!lcdState) {
            return
        }

        const highnib =
            (payload & 0xf0) |
            lcdState.backlight |
            RS_bit

        const lownib =
            ((payload << 4) & 0xf0) |
            lcdState.backlight |
            RS_bit

        lcdState.sendBuffer.setNumber(
            NumberFormat.Int8LE,
            0,
            highnib
        )

        lcdState.sendBuffer.setNumber(
            NumberFormat.Int8LE,
            1,
            highnib | 0x04
        )

        lcdState.sendBuffer.setNumber(
            NumberFormat.Int8LE,
            2,
            highnib & (0xff ^ 0x04)
        )

        lcdState.sendBuffer.setNumber(
            NumberFormat.Int8LE,
            3,
            lownib
        )

        lcdState.sendBuffer.setNumber(
            NumberFormat.Int8LE,
            4,
            lownib | 0x04
        )

        lcdState.sendBuffer.setNumber(
            NumberFormat.Int8LE,
            5,
            lownib & (0xff ^ 0x04)
        )

        pins.i2cWriteBuffer(
            lcdState.i2cAddress,
            lcdState.sendBuffer
        )
    }

    function sendCommand(
        lcdState: LcdState,
        command: number
    ): void {

        send(
            lcdState,
            Lcd.Command,
            command
        )
    }

    function sendData(
        lcdState: LcdState,
        data: number
    ): void {

        send(
            lcdState,
            Lcd.Data,
            data
        )
    }

    // =========================================================
    // CURSOR
    // =========================================================

    function setCursor(
        lcdState: LcdState,
        line: number,
        column: number
    ): void {

        const offsets = [
            0x00,
            0x40,
            0x14,
            0x54
        ]

        sendCommand(
            lcdState,
            0x80 |
            (offsets[line] + column)
        )
    }

    // =========================================================
    // REFRESH
    // =========================================================

    function requestRedraw(
        lcdState: LcdState
    ): void {

        if (!lcdState) {
            return
        }

        if (!lcdState.refreshIntervalId) {

            lcdState.refreshIntervalId =
                control.setInterval(
                    () => refreshDisplay(lcdState),
                    100,
                    control.IntervalMode.Timeout
                )
        }

        basic.pause(0)
    }

    function initBuffer(
        lcdState: LcdState,
        columns: number,
        rows: number
    ): void {

        if (
            lcdState &&
            lcdState.columns === 0
        ) {

            lcdState.columns = columns
            lcdState.rows = rows

            lcdState.characters =
                pins.createBuffer(
                    lcdState.rows *
                    lcdState.columns
                )

            const whitespace =
                "x".charCodeAt(0)

            for (
                let pos = 0;
                pos <
                lcdState.rows * lcdState.columns;
                pos++
            ) {

                lcdState.characters[pos] =
                    whitespace
            }

            updateCharacterBuffer(
                lcdState,
                "",
                0,
                lcdState.columns *
                lcdState.rows,
                lcdState.columns,
                lcdState.rows,
                TextAlignment.Left,
                " "
            )
        }
    }

    // =========================================================
    // TEXT BUFFER
    // =========================================================

    function updateCharacterBuffer(
        lcdState: LcdState,
        text: string,
        offset: number,
        length: number,
        columns: number,
        rows: number,
        alignment: TextAlignment,
        pad: string
    ): void {

        if (
            !lcdState ||
            !lcdState.connected
        ) {
            return
        }

        initBuffer(
            lcdState,
            columns,
            rows
        )

        if (
            columns !== lcdState.columns ||
            rows !== lcdState.rows
        ) {
            return
        }

        if (offset < 0) {
            offset = 0
        }

        const fillCharacter =
            pad.length > 0
                ? pad.charCodeAt(0)
                : " ".charCodeAt(0)

        let endPosition =
            offset + length

        if (
            endPosition >
            lcdState.columns *
            lcdState.rows
        ) {

            endPosition =
                lcdState.columns *
                lcdState.rows
        }

        let lcdPos = offset

        let paddingEnd = offset

        if (
            alignment ===
            TextAlignment.Right
        ) {

            paddingEnd =
                endPosition -
                text.length

        } else if (
            alignment ===
            TextAlignment.Center
        ) {

            paddingEnd =
                offset +
                Math.idiv(
                    endPosition -
                    offset -
                    text.length,
                    2
                )
        }

        // Beginning padding
        while (
            lcdPos < paddingEnd
        ) {

            if (
                lcdState.characters[lcdPos] !=
                fillCharacter
            ) {

                lcdState.characters[lcdPos] =
                    fillCharacter

                invalidateLcdPosition(
                    lcdState,
                    lcdPos
                )
            }

            lcdPos++
        }

        // Text
        let textPosition = 0

        while (
            lcdPos < endPosition &&
            textPosition < text.length
        ) {

            const character =
                text.charCodeAt(
                    textPosition
                )

            if (
                lcdState.characters[lcdPos] !=
                character
            ) {

                lcdState.characters[lcdPos] =
                    character

                invalidateLcdPosition(
                    lcdState,
                    lcdPos
                )
            }

            lcdPos++
            textPosition++
        }

        // Ending padding
        while (
            lcdPos < endPosition
        ) {

            if (
                lcdState.characters[lcdPos] !=
                fillCharacter
            ) {

                lcdState.characters[lcdPos] =
                    fillCharacter

                invalidateLcdPosition(
                    lcdState,
                    lcdPos
                )
            }

            lcdPos++
        }

        requestRedraw(
            lcdState
        )
    }

    // =========================================================
    // DISPLAY REFRESH
    // =========================================================

    function sendRowRepeated(
        lcdState: LcdState,
        row: number
    ): void {

        setCursor(
            lcdState,
            row,
            0
        )

        for (
            let position =
                lcdState.columns * row;

            position <
            lcdState.columns * (row + 1);

            position++
        ) {

            sendData(
                lcdState,
                lcdState.characters[position]
            )
        }
    }

    function refreshDisplay(
        lcdState: LcdState
    ): void {

        if (!lcdState) {
            return
        }

        lcdState.refreshIntervalId =
            undefined

        for (
            let i = 0;
            i < lcdState.rows;
            i++
        ) {

            if (
                lcdState.rowNeedsUpdate &
                (1 << i)
            ) {

                lcdState.rowNeedsUpdate &=
                    ~(1 << i)

                sendRowRepeated(
                    lcdState,
                    i
                )
            }
        }
    }

    function invalidateLcdPosition(
        lcdState: LcdState,
        lcdPos: number
    ): void {

        lcdState.rowNeedsUpdate |=
            1 << Math.idiv(
                lcdPos,
                lcdState.columns
            )
    }

    // =========================================================
    // ALIGNMENT
    // =========================================================

    export function toAlignment(
        option?: TextOption
    ): TextAlignment {

        if (
            option ===
            TextOption.AlignRight ||

            option ===
            TextOption.PadWithZeros
        ) {

            return TextAlignment.Right

        } else if (
            option ===
            TextOption.AlignCenter
        ) {

            return TextAlignment.Center

        } else {

            return TextAlignment.Left
        }
    }

    export function toPad(
        option?: TextOption
    ): string {

        if (
            option ===
            TextOption.PadWithZeros
        ) {

            return "0"

        } else {

            return " "
        }
    }

    // =========================================================
    // INITIALIZE LCD
    // =========================================================

    function createLCDState(
        i2cAddress: number
    ): LcdState {

        return {
            i2cAddress: i2cAddress,
            backlight: LcdBacklight.On,
            columns: 0,
            rows: 0,
            characters: undefined,
            rowNeedsUpdate: 0,
            refreshIntervalId: undefined,
            sendBuffer:
                pins.createBuffer(
                    6 *
                    pins.sizeOf(
                        NumberFormat.Int8LE
                    )
                ),
            connected: false
        }
    }

    function initializeLCD(
        lcdState: LcdState
    ): void {

        // Wait 50ms after power-on.
        basic.pause(50)

        pins.i2cWriteNumber(
            lcdState.i2cAddress,
            lcdState.backlight,
            NumberFormat.Int8LE
        )

        basic.pause(50)

        const buf =
            pins.createBuffer(
                3 *
                pins.sizeOf(
                    NumberFormat.Int8LE
                )
            )

        // Set 4-bit mode.
        write4bits(
            lcdState.i2cAddress,
            0x30,
            buf
        )

        control.waitMicros(4100)

        write4bits(
            lcdState.i2cAddress,
            0x30,
            buf
        )

        control.waitMicros(4100)

        write4bits(
            lcdState.i2cAddress,
            0x30,
            buf
        )

        control.waitMicros(4100)

        write4bits(
            lcdState.i2cAddress,
            0x20,
            buf
        )

        control.waitMicros(1000)

        lcdState.connected = true

        // Function set.
        sendCommand(
            lcdState,
            0x20 |
            0x00 |
            0x08 |
            0x00
        )

        control.waitMicros(1000)

        // Display on.
        sendCommand(
            lcdState,
            0x08 |
            0x04 |
            0x00 |
            0x00
        )

        control.waitMicros(1000)

        // Entry mode.
        sendCommand(
            lcdState,
            0x04 |
            0x02 |
            0x00
        )

        control.waitMicros(1000)

        initBuffer(
            lcdState,
            16,
            2
        )
    }

    // =========================================================
    // CONNECT LCD 1
    // =========================================================

    //% subcategory="Setup"
    //% blockId="dual_lcd_connect_1"
    //% block="connect LCD 1 at I2C address %address"
    //% address.min=0 address.max=127
    //% weight=100
    export function connectLcd1(
        address: number
    ): void {

        if (
            lcd1State &&
            lcd1State.i2cAddress ==
            address
        ) {

            return
        }

        if (
            lcd1State &&
            lcd1State.refreshIntervalId
        ) {

            control.clearInterval(
                lcd1State.refreshIntervalId,
                control.IntervalMode.Timeout
            )

            lcd1State.refreshIntervalId =
                undefined
        }

        lcd1State =
            createLCDState(
                address
            )

        initializeLCD(
            lcd1State
        )
    }

    // =========================================================
    // CONNECT LCD 2
    // =========================================================

    //% subcategory="Setup"
    //% blockId="dual_lcd_connect_2"
    //% block="connect LCD 2 at I2C address %address"
    //% address.min=0 address.max=127
    //% weight=99
    export function connectLcd2(
        address: number
    ): void {

        if (
            lcd2State &&
            lcd2State.i2cAddress ==
            address
        ) {

            return
        }

        if (
            lcd2State &&
            lcd2State.refreshIntervalId
        ) {

            control.clearInterval(
                lcd2State.refreshIntervalId,
                control.IntervalMode.Timeout
            )

            lcd2State.refreshIntervalId =
                undefined
        }

        lcd2State =
            createLCDState(
                address
            )

        initializeLCD(
            lcd2State
        )
    }

    // =========================================================
    // TEXT — LCD 1
    // =========================================================

    export function showStringOnLcd1(
        text: string,
        startPosition: number,
        length: number,
        option?: TextOption
    ): void {

        updateCharacterBuffer(
            lcd1State,
            text,
            startPosition - 1,
            length,
            16,
            2,
            toAlignment(option),
            toPad(option)
        )
    }

    // =========================================================
    // TEXT — LCD 2
    // =========================================================

    export function showStringOnLcd2(
        text: string,
        startPosition: number,
        length: number,
        option?: TextOption
    ): void {

        updateCharacterBuffer(
            lcd2State,
            text,
            startPosition - 1,
            length,
            16,
            2,
            toAlignment(option),
            toPad(option)
        )
    }

    // =========================================================
    // NUMBER — LCD 1
    // =========================================================

    //% subcategory="LCD 1"
    //% blockId="dual_lcd_show_number_1"
    //% block="LCD 1 show number %number |at position %position"
    //% position.min=1 position.max=32
    //% weight=88
    export function showNumberOnLcd1(
        number: number,
        position: number
    ): void {

        const text =
            "" + number

        showStringOnLcd1(
            text,
            position,
            text.length
        )
    }

    // =========================================================
    // NUMBER — LCD 2
    // =========================================================

    //% subcategory="LCD 2"
    //% blockId="dual_lcd_show_number_2"
    //% block="LCD 2 show number %number |at position %position"
    //% position.min=1 position.max=32
    //% weight=87
    export function showNumberOnLcd2(
        number: number,
        position: number
    ): void {

        const text =
            "" + number

        showStringOnLcd2(
            text,
            position,
            text.length
        )
    }

    // =========================================================
    // CLEAR
    // =========================================================

    //% subcategory="LCD 1"
    //% block="LCD 1 clear display"
    //% weight=80
    export function clearLcd1(): void {

        showStringOnLcd1(
            "",
            1,
            32
        )
    }

    //% subcategory="LCD 2"
    //% block="LCD 2 clear display"
    //% weight=79
    export function clearLcd2(): void {

        showStringOnLcd2(
            "",
            1,
            32
        )
    }

    // =========================================================
    // BACKLIGHT
    // =========================================================

    //% subcategory="LCD 1"
    //% block="LCD 1 backlight %backlight"
    //% weight=70
    export function setBacklight1(
        backlight: LcdBacklight
    ): void {

        if (!lcd1State) {
            return
        }

        lcd1State.backlight =
            backlight

        send(
            lcd1State,
            Lcd.Command,
            0
        )
    }

    //% subcategory="LCD 2"
    //% block="LCD 2 backlight %backlight"
    //% weight=69
    export function setBacklight2(
        backlight: LcdBacklight
    ): void {

        if (!lcd2State) {
            return
        }

        lcd2State.backlight =
            backlight

        send(
            lcd2State,
            Lcd.Command,
            0
        )
    }

    // =========================================================
    // CUSTOM CHARACTER
    // =========================================================

    function makeCharacter(
        lcdState: LcdState,
        char: LcdChar,
        im: Image
    ): void {

        if (
            !lcdState ||
            !lcdState.connected
        ) {
            return
        }

        const customChar =
            [0, 0, 0, 0, 0, 0, 0, 0]

        // EXACT MakerBit 5x8 method.
        for (
            let y = 0;
            y < 8;
            y++
        ) {

            for (
                let x = 0;
                x < 5;
                x++
            ) {

                if (
                    im.pixel(x, y)
                ) {

                    customChar[y] |=
                        1 << (4 - x)
                }
            }
        }

        // CGRAM address.
        const LCD_SETCGRAMADDR =
            0x40

        sendCommand(
            lcdState,
            LCD_SETCGRAMADDR |
            (char << 3)
        )

        for (
            let y = 0;
            y < 8;
            y++
        ) {

            sendData(
                lcdState,
                customChar[y]
            )
        }

        control.waitMicros(1000)
    }

    //% subcategory="Custom Characters"
    //% blockId="dual_lcd_make_character_1"
    //% block="LCD 1 make character %char %im"
    //% imageLiteral=1
    //% imageLiteralColumns=5
    //% imageLiteralRows=8
    //% imageLiteralScale=0.6
    //% shim=images::createImage
    //% weight=60
    export function lcd1MakeCharacter(
        char: LcdChar,
        im: Image
    ): void {

        makeCharacter(
            lcd1State,
            char,
            im
        )
    }

    //% subcategory="Custom Characters"
    //% blockId="dual_lcd_make_character_2"
    //% block="LCD 2 make character %char %im"
    //% imageLiteral=1
    //% imageLiteralColumns=5
    //% imageLiteralRows=8
    //% imageLiteralScale=0.6
    //% shim=images::createImage
    //% weight=59
    export function lcd2MakeCharacter(
        char: LcdChar,
        im: Image
    ): void {

        makeCharacter(
            lcd2State,
            char,
            im
        )
    }

    // =========================================================
    // CHARACTER PIXEL EDITOR
    // =========================================================

    //% subcategory="Custom Characters"
    //% blockId="dual_lcd_character_pixels"
    //% block="character"
    //% imageLiteral=1
    //% imageLiteralColumns=5
    //% imageLiteralRows=8
    //% imageLiteralScale=0.6
    //% shim=images::createImage
    //% weight=58
    export function lcdCharacterPixels(
        i: string
    ): Image {

        return <Image><any>i
    }

    // =========================================================
    // SHOW CUSTOM CHARACTER
    // =========================================================

    function setCharacter(
        lcdState: LcdState,
        char: number,
        offset: number,
        columns: number,
        rows: number
    ): void {

        if (
            !lcdState ||
            !lcdState.connected
        ) {
            return
        }

        initBuffer(
            lcdState,
            columns,
            rows
        )

        if (
            columns !== lcdState.columns ||
            rows !== lcdState.rows
        ) {
            return
        }

        if (
            offset < 0 ||
            offset >=
            lcdState.rows *
            lcdState.columns
        ) {
            return
        }

        lcdState.characters[offset] =
            char

        invalidateLcdPosition(
            lcdState,
            offset
        )

        requestRedraw(
            lcdState
        )
    }

    //% subcategory="Custom Characters"
    //% blockId="dual_lcd_show_character_1"
    //% block="LCD 1 show character %char |at position %position"
    //% position.min=1 position.max=32
    //% weight=55
    export function lcd1ShowCharacter(
        char: LcdChar,
        position: number
    ): void {

        setCharacter(
            lcd1State,
            char,
            position - 1,
            16,
            2
        )
    }

    //% subcategory="Custom Characters"
    //% blockId="dual_lcd_show_character_2"
    //% block="LCD 2 show character %char |at position %position"
    //% position.min=1 position.max=32
    //% weight=54
    export function lcd2ShowCharacter(
        char: LcdChar,
        position: number
    ): void {

        setCharacter(
            lcd2State,
            char,
            position - 1,
            16,
            2
        )
    }

    // =========================================================
    // CONNECTION STATUS
    // =========================================================

    //% subcategory="Setup"
    //% block="LCD 1 is connected"
    //% weight=30
    export function isLcd1Connected(): boolean {

        return !!lcd1State &&
            lcd1State.connected
    }

    //% subcategory="Setup"
    //% block="LCD 2 is connected"
    //% weight=29
    export function isLcd2Connected(): boolean {

        return !!lcd2State &&
            lcd2State.connected
    }
}
