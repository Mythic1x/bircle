import {MessageEmbed, Message} from "discord.js"

declare global{
    type ArgumentList = Array<string>

    type Opts = {[k: string]: string | boolean}

    interface CommandFile{
	attachment: string,
	name?: string,
	description?: string,
	delete?: boolean
    }

    type FileArray = Array<CommandFile>

    interface CommandReturn {
	content?: string,
	embeds?: Array<typeof MessageEmbed>
	files?: FileArray,
	deleteFiles?: boolean
	delete?: boolean
    }

    interface CommandHelp{
	info?: string,
	aliases?: string[],
	arguments?: {
	    [key: string]: {
		description: string,
		required?: boolean
	    }
	},
	options?: {
	    [key: string]: {
		description: string
	    }
	}
    }

    interface Command{
	run: (msg: Message, args: ArgumentList) => Promise<CommandReturn>;
	permCheck?: (msg: Message) => boolean;
	help?: CommandHelp
    }
}
