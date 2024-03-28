# Suggest professional associations for occupations using GPT

This NodeJS script uses OpenAI's Chat Completions API to gather professional associations related to particular occupations. It was developed by the National Center for O\*NET Development as part of a process to update information in the [O\*NET OnLine](https://www.onetonline.org/) web application.

For more information on this effort, see the technical report:

[Supplementing the O\*NET Sources of Additional Information: A Preliminary Exploration of the Use of ChatGPT](https://www.onetcenter.org/reports/SAI_GPT.html)

## Running the script

The command-line script was tested on Linux with NodeJS 16 installed. A prepaid OpenAI account is required; the test run with the input data supplied here consumed approximately $30 in processing fees in August 2023.

    npm install
    env OPENAI_TOKEN=*your-token-here* node suggest-assns.mjs < input_data.xlsx > output_suggestions.xlsx

## License

This code is licensed under the terms of the MIT license (see the `LICENSE` file for details).
