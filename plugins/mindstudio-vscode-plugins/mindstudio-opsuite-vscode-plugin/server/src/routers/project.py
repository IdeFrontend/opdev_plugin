#  Copyright (c) 2025, Huawei Technologies.
#  All Rights Reserved.
#  #
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  #
#      http://www.apache.org/licenses/LICENSE-2.0
#  #
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#  ==============================================================================

from flask import Blueprint, request

from service.project import create_project


project_bp = Blueprint('project', __name__)

@project_bp.route('', methods=['POST'])
def create():
    data = request.get_json()
    if not data or 'project_path' not in data or 'project_name' not in data:
        return {'code': 1, 'data': {'status': 'failure', 'message': 'request body is invalid'}}
    project_id = create_project(data)
    return {
        'code': 0,
        'data': project_id,
        'message': 'success'
    }
